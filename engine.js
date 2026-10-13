/* Deterministic simulation. Timed effects advance only while gameplay advances. */
(function(root){
'use strict';
const W=960,H=640,LEFT=32,RIGHT=928,TOP=34,PADDLE_Y=586,R=7,GUARD_Y=624;
const NORMAL_KINDS=['wide','multi','slow','catch'],RARE_KINDS=['guard','beam','pierce'];
const SKILLS={
 guard:{name:'ノエル・ガーディアン',en:'NOEL GUARDIAN',icon:'N',seconds:12,description:'横たわるノエルが底を守る。ボールが5個になり、12秒間は落下しません。',color:'#f3a5b8'},
 beam:{name:'ローズ・レーザー',en:'ROSE LASER',icon:'B',seconds:8,description:'8秒間、パドルの両端からビームを連射。狙った列のブロックを撃ち抜きます。',color:'#87d8d4'},
 pierce:{name:'プリズム・オーバードライブ',en:'PRISM OVERDRIVE',icon:'P',seconds:8,description:'8秒間、すべてのボールがブロックを貫通。硬いブロックも一撃で壊します。',color:'#eac58c'}
};
const STAGES=[
 ['ROSE GATE','薔薇の扉','#eea5b9'],['AMBER GARDEN','琥珀の庭','#eac58c'],
 ['AQUA MIRROR','水鏡','#87d8d4'],['VELVET NIGHT','夜のベルベット','#b7a1db'],
 ['GOLDEN ARCH','黄金のアーチ','#efcb86'],['STAR RIBBON','星のリボン','#efa9c2'],
 ['CRYSTAL WALTZ','水晶のワルツ','#90dbe5'],['MOON PALACE','月の宮殿','#c3b2e7'],
 ['PRISM HEART','プリズムの心','#f6bba1'],['NOEL FINALE','ノエル・フィナーレ','#f0d9ac']
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class Engine{
 constructor(){this.events=[];this.newGame();}
 newGame(){this.events=[];this.score=0;this.lives=4;this.level=0;this.elapsed=0;this.combo=0;this.stock=null;this.status='ready';this.setupStage();}
 setupStage(){
  this.bricks=[];this.drops=[];this.balls=[];this.beams=[];this.combo=0;
  this.wideUntil=0;this.slowUntil=0;this.catchUntil=0;this.guardUntil=0;this.beamUntil=0;this.pierceUntil=0;this.nextBeamAt=0;
  // The single stocked skill survives a life loss or stage transition.
  this.paddle={x:480,target:480,width:124};this.status='ready';
  const cols=12,rows=6,bw=66,bh=22,gap=6,baseX=(W-(cols*bw+(cols-1)*gap))/2;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   let present=true;
   switch(this.level%5){
    case 0:present=!(row===5&&(col<2||col>9));break;
    case 1:present=!(row===0&&(col<2||col>9))&&!(row===5&&(col===5||col===6));break;
    case 2:present=(row+col)%4!==0;break;
    case 3:present=Math.abs(col-5.5)<=5.5-row*.5;break;
    case 4:present=!(row>1&&row<4&&col>3&&col<8);break;
   }
   if(!present)continue;
   const hp=1+(this.level>=2&&row<2?1:0)+(this.level>=6&&row===0?1:0);
   this.bricks.push({x:baseX+col*(bw+gap),y:100+row*(bh+gap),w:bw,h:bh,hp,max:hp,row,col});
  }
  this.initialBricks=this.bricks.length;this.parkBall();this.events.push({type:'stage',level:this.level});
 }
 parkBall(){this.balls=[{x:this.paddle.x,y:PADDLE_Y-R-1,vx:0,vy:0,held:true,offset:0,trail:[]}];}
 speed(){return Math.min(510,310+this.level*17);}
 launch(){
  if(!['ready','playing'].includes(this.status))return false;
  let released=0;
  for(const b of this.balls)if(this.status==='ready'||b.held){
   const ratio=clamp((b.offset||0)/(this.paddle.width/2),-.85,.85),angle=ratio*1.05+.18;
   b.vx=Math.sin(angle)*this.speed();b.vy=-Math.cos(angle)*this.speed();b.held=false;b.trail=[];released++;
  }
  if(!released)return false;this.status='playing';this.events.push({type:'launch'});return true;
 }
 target(x){this.paddle.target=clamp(x,LEFT+this.paddle.width/2,RIGHT-this.paddle.width/2);}
 nextStage(){if(this.status!=='clear')return;if(this.level===9){this.status='won';return;}this.level++;this.setupStage();}
 activeSkill(){for(const kind of RARE_KINDS)if(this[kind+'Until']>this.elapsed)return {kind,remaining:this[kind+'Until']-this.elapsed};return null;}
 activateStock(){
  if(!this.stock||!['ready','playing'].includes(this.status)||this.activeSkill())return false;
  const kind=this.stock;this.stock=null;this.launch();this[kind+'Until']=this.elapsed+SKILLS[kind].seconds;
  if(kind==='guard'){
   // Clear any magnets so all five balls immediately take part in the skill.
   this.catchUntil=0;this.addBalls(5);for(const b of this.balls){b.held=false;if(b.y+R>=GUARD_Y){b.y=GUARD_Y-R-1;b.vy=-Math.abs(b.vy||this.speed());}}
  }
  if(kind==='beam')this.nextBeamAt=this.elapsed;
  this.events.push({type:'skill',kind});return true;
 }
 addBalls(total){
  if(!this.balls.length)return;
  const first=this.balls.find(b=>!b.held)||this.balls[0],speed=Math.hypot(first.vx,first.vy)||this.speed();
  while(this.balls.length<Math.min(5,total)){
   const angles=[-.9,-.45,.45,.9],angle=angles[(this.balls.length-1)%4];
   this.balls.push({x:clamp(first.x,LEFT+R,RIGHT-R),y:Math.min(first.y,PADDLE_Y-R-1),vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,held:false,offset:0,trail:[]});
  }
 }
 update(dt){
  if(!['playing','ready'].includes(this.status))return;
  dt=clamp(dt,0,.05);this.elapsed+=dt;
  const width=this.wideUntil>this.elapsed?184:124;this.paddle.width=width;
  this.paddle.target=clamp(this.paddle.target,LEFT+width/2,RIGHT-width/2);
  this.paddle.x=clamp(this.paddle.x+(this.paddle.target-this.paddle.x)*Math.min(1,dt*28),LEFT+width/2,RIGHT-width/2);
  for(const b of this.balls)if(b.held){b.offset=clamp(b.offset||0,-width/2+R,width/2-R);b.x=this.paddle.x+b.offset;b.y=PADDLE_Y-R-1;}
  if(this.status==='ready')return;
  if(this.catchUntil<=this.elapsed&&this.balls.some(b=>b.held))this.launch();
  if(this.beamUntil>this.elapsed&&this.elapsed>=this.nextBeamAt){
   for(const x of [this.paddle.x-width/2+8,this.paddle.x+width/2-8])this.beams.push({x,y:PADDLE_Y-10});
   this.nextBeamAt=this.elapsed+.32;this.events.push({type:'beam-shot'});
  }
  const steps=Math.max(1,Math.ceil(dt/(1/180))),sub=dt/steps;
  for(let i=0;i<steps&&this.status==='playing';i++)this.step(sub);
  for(const b of this.balls)if(!b.held){b.trail.push({x:b.x,y:b.y});if(b.trail.length>9)b.trail.shift();}
  if(this.status!=='playing')return;
  for(const d of this.drops)d.y+=95*dt;
  for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];
   if(d.y+12>=PADDLE_Y&&d.y-12<PADDLE_Y+16&&Math.abs(d.x-this.paddle.x)<width/2+12){this.power(d.kind);this.drops.splice(i,1);}
   else if(d.y>H+20)this.drops.splice(i,1);
  }
 }
 damage(brick,amount=1){
  if(brick.hp<=0)return;brick.hp=Math.max(0,brick.hp-amount);this.combo++;
  const points=50+(this.combo-1)*10+(brick.hp===0?50:0);this.score+=points;
  this.events.push({type:'brick',x:brick.x+brick.w/2,y:brick.y+brick.h/2,points,combo:this.combo,row:brick.row,broken:brick.hp===0});
  if(brick.hp!==0)return;
  const id=brick.row*12+brick.col+this.level*7;
  // Two rare drops per typical stage, less frequent than ordinary powerups.
  if((id+9)%37===0){const kind=RARE_KINDS[(Math.floor(id/37)+this.level)%3];this.drops.push({x:brick.x+brick.w/2,y:brick.y+brick.h/2,kind});}
  else if((brick.col+brick.row*3+this.level)%11===0)this.drops.push({x:brick.x+brick.w/2,y:brick.y+brick.h/2,kind:NORMAL_KINDS[(brick.row+this.level)%4]});
 }
 step(dt){
  const scale=this.slowUntil>this.elapsed?.72:1,piercing=this.pierceUntil>this.elapsed;
  for(const b of this.balls){
   if(b.held)continue;
   const px=b.x,py=b.y;b.x+=b.vx*dt*scale;b.y+=b.vy*dt*scale;
   if(b.x<LEFT+R){b.x=LEFT+R;b.vx=Math.abs(b.vx);this.events.push({type:'wall'});}
   if(b.x>RIGHT-R){b.x=RIGHT-R;b.vx=-Math.abs(b.vx);this.events.push({type:'wall'});}
   if(b.y<TOP+R){b.y=TOP+R;b.vy=Math.abs(b.vy);this.events.push({type:'wall'});}
   if(this.guardUntil>this.elapsed&&b.y+R>=GUARD_Y){b.y=GUARD_Y-R-1;b.vy=-Math.abs(b.vy||this.speed());this.events.push({type:'guard-bounce',x:b.x});}
   if(b.vy>0&&b.y+R>=PADDLE_Y&&py+R<=PADDLE_Y+12&&Math.abs(b.x-this.paddle.x)<this.paddle.width/2+R){
    const hit=clamp((b.x-this.paddle.x)/(this.paddle.width/2),-1,1),angle=hit*1.05,speed=Math.max(this.speed(),Math.hypot(b.vx,b.vy));
    b.y=PADDLE_Y-R-1;this.combo=0;
    if(this.catchUntil>this.elapsed){b.held=true;b.offset=clamp(b.x-this.paddle.x,-this.paddle.width/2+R,this.paddle.width/2-R);b.vx=0;b.vy=0;b.trail=[];this.events.push({type:'catch'});continue;}
    b.vx=Math.sin(angle)*speed;b.vy=-Math.cos(angle)*speed;this.events.push({type:'paddle'});
   }
   for(const brick of this.bricks){
    if(brick.hp<=0)continue;
    const nx=clamp(b.x,brick.x,brick.x+brick.w),ny=clamp(b.y,brick.y,brick.y+brick.h);
    if((b.x-nx)**2+(b.y-ny)**2>R*R)continue;
    if(piercing){this.damage(brick,brick.hp);continue;}
    if(py+R<=brick.y){b.y=brick.y-R-.1;b.vy=-Math.abs(b.vy);}
    else if(py-R>=brick.y+brick.h){b.y=brick.y+brick.h+R+.1;b.vy=Math.abs(b.vy);}
    else if(px+R<=brick.x){b.x=brick.x-R-.1;b.vx=-Math.abs(b.vx);}
    else if(px-R>=brick.x+brick.w){b.x=brick.x+brick.w+R+.1;b.vx=Math.abs(b.vx);}
    else{
     const dx=Math.min(Math.abs(b.x-brick.x),Math.abs(b.x-brick.x-brick.w)),dy=Math.min(Math.abs(b.y-brick.y),Math.abs(b.y-brick.y-brick.h));
     if(dx<dy){b.vx=-b.vx;b.x=b.x<brick.x+brick.w/2?brick.x-R-.1:brick.x+brick.w+R+.1;}
     else{b.vy=-b.vy;b.y=b.y<brick.y+brick.h/2?brick.y-R-.1:brick.y+brick.h+R+.1;}
    }
    this.damage(brick);break;
   }
  }
  for(let i=this.beams.length-1;i>=0;i--){const beam=this.beams[i],prevY=beam.y;beam.y-=760*dt;
   const candidates=this.bricks.filter(b=>b.hp>0&&beam.x+3>=b.x&&beam.x-3<=b.x+b.w&&beam.y-20<=b.y+b.h&&prevY>=b.y).sort((a,b)=>b.y-a.y);
   if(candidates.length){this.damage(candidates[0]);this.beams.splice(i,1);}
   else if(beam.y<TOP)this.beams.splice(i,1);
  }
  this.balls=this.balls.filter(b=>b.held||b.y<H+R);
  if(!this.bricks.some(b=>b.hp>0)){this.score+=500+this.lives*200;this.status=this.level===9?'won':'clear';this.events.push({type:this.status});return;}
  if(!this.balls.length){this.lives--;this.combo=0;this.drops=[];this.beams=[];this.catchUntil=this.guardUntil=this.beamUntil=this.pierceUntil=0;
   if(this.lives<=0){this.status='over';this.events.push({type:'over'});}else{this.status='ready';this.parkBall();this.events.push({type:'miss'});}
  }
 }
 power(kind){
  if(RARE_KINDS.includes(kind)){
   if(this.stock){this.events.push({type:'stock-full',kind,kept:this.stock});return false;}
   this.stock=kind;this.score+=150;this.events.push({type:'stock',kind});return true;
  }
  if(!NORMAL_KINDS.includes(kind))return false;
  if(kind==='wide')this.wideUntil=this.elapsed+16;
  if(kind==='slow')this.slowUntil=this.elapsed+12;
  if(kind==='catch')this.catchUntil=this.elapsed+18;
  if(kind==='multi'&&this.status==='playing')this.addBalls(this.balls.length+2);
  this.score+=150;this.events.push({type:'power',kind});return true;
 }
 snapshot(){return JSON.parse(JSON.stringify({version:2,score:this.score,lives:this.lives,level:this.level,elapsed:this.elapsed,combo:this.combo,status:this.status,paddle:this.paddle,bricks:this.bricks,balls:this.balls.map(b=>({...b,held:!!b.held,offset:b.offset||0})),drops:this.drops,wideUntil:this.wideUntil,slowUntil:this.slowUntil,catchUntil:this.catchUntil,guardUntil:this.guardUntil,beamUntil:this.beamUntil,pierceUntil:this.pierceUntil,nextBeamAt:this.nextBeamAt,stock:this.stock,beams:this.beams,initialBricks:this.initialBricks}));}
 static upgrade(data){
  if(!data||![1,2].includes(data.version))return null;
  const s=JSON.parse(JSON.stringify(data));
  if(s.version===1){s.version=2;for(const name of ['catchUntil','guardUntil','beamUntil','pierceUntil','nextBeamAt'])s[name]=0;s.stock=null;s.beams=[];if(Array.isArray(s.balls))s.balls=s.balls.map(b=>({...b,held:s.status==='ready',offset:0}));}
  return s;
 }
 restore(data){const s=Engine.upgrade(data);if(!Engine.valid(s))throw new Error('Invalid save');delete s.version;Object.assign(this,s);this.events=[];}
 static valid(data){
  let s;try{s=Engine.upgrade(data);}catch{return false;}
  const number=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi,integer=(v,lo,hi)=>Number.isInteger(v)&&number(v,lo,hi);
  if(!s||!integer(s.level,0,9)||!integer(s.lives,1,4)||!integer(s.score,0,1e9)||!number(s.elapsed,0,1e7)||!integer(s.combo,0,1000)||!['ready','playing','clear'].includes(s.status))return false;
  if(!s.paddle||!number(s.paddle.x,LEFT,RIGHT)||!number(s.paddle.target,LEFT,RIGHT)||![124,184].includes(s.paddle.width))return false;
  if(!integer(s.initialBricks,1,72)||!['wideUntil','slowUntil','catchUntil','guardUntil','beamUntil','pierceUntil','nextBeamAt'].every(k=>number(s[k],0,1e7)))return false;
  if(s.stock!==null&&!RARE_KINDS.includes(s.stock))return false;
  if(!Array.isArray(s.bricks)||s.bricks.length!==s.initialBricks||!s.bricks.every(b=>b&&number(b.x,LEFT,RIGHT)&&number(b.y,70,350)&&b.w===66&&b.h===22&&integer(b.hp,0,3)&&integer(b.max,1,3)&&b.hp<=b.max&&integer(b.row,0,5)&&integer(b.col,0,11)))return false;
  if(!Array.isArray(s.balls)||s.balls.length<(s.status==='clear'?0:1)||s.balls.length>5||!s.balls.every(b=>b&&number(b.x,LEFT-20,RIGHT+20)&&number(b.y,0,H+R)&&number(b.vx,-1000,1000)&&number(b.vy,-1000,1000)&&typeof b.held==='boolean'&&number(b.offset,-92,92)&&Array.isArray(b.trail)&&b.trail.length<=9&&b.trail.every(p=>p&&number(p.x,0,W)&&number(p.y,0,H+R))))return false;
  if(!Array.isArray(s.drops)||s.drops.length>72||!s.drops.every(d=>d&&number(d.x,LEFT,RIGHT)&&number(d.y,0,H+20)&&[...NORMAL_KINDS,...RARE_KINDS].includes(d.kind)))return false;
  if(!Array.isArray(s.beams)||s.beams.length>60||!s.beams.every(b=>b&&number(b.x,LEFT,RIGHT)&&number(b.y,0,PADDLE_Y)))return false;
  return true;
 }
}
const api={Engine,STAGES,SKILLS,NORMAL_KINDS,RARE_KINDS,W,H,LEFT,RIGHT,TOP,PADDLE_Y,R,GUARD_Y,clamp};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NoelGame=api;
})(typeof globalThis!=='undefined'?globalThis:this);
