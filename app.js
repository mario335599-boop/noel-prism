'use strict';
(() => {
const $=id=>document.getElementById(id);
const {Engine,STAGES,SKILLS,RARE_KINDS,W,H,LEFT,RIGHT,TOP,PADDLE_Y,R,GUARD_Y,clamp}=NoelGame;
const engine=new Engine(),canvas=$('arena'),ctx=canvas.getContext('2d');
const sprites=[['idle','いつものノエル','IDLE'],['smile','やさしい笑顔','SMILE'],['cheer','全力で応援','CHEER'],['surprise','びっくり！','SURPRISE'],['focus','本気のまなざし','FOCUS'],['sad','ちょっとしょんぼり','SAD'],['victory','やったね！','VICTORY'],['bow','おつかれさま','BOW'],['wave','ようこそ','WELCOME'],['magic','プリズムの魔法','MAGIC']];
const images={};for(const [name] of sprites){const img=new Image();img.src=`assets/${name}.png`;images[name]=img;}
images.guard=new Image();images.guard.src='assets/guard.png';
let screen='menu',paused=false,currentModal=null,keys=new Set(),particles=[],texts=[],shake=0,lastTime=0,saveTime=0,faceUntil=0,face='idle',sound=true,audio=null,rankingRecorded=false,lastFocus=null;
const SAVE_KEY='noel-prism-save-v1',RANK_KEY='noel-prism-ranking-v1',SETTINGS_KEY='noel-prism-settings-v1';
let canSave=true;
try{localStorage.setItem('noel-prism-check','ok');localStorage.removeItem('noel-prism-check');}catch{canSave=false;$('storage-warning').classList.remove('hidden');}
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{canSave=false;$('storage-warning').classList.remove('hidden');return false;}}
function remove(key){try{localStorage.removeItem(key);}catch{canSave=false;}}
const settings=read(SETTINGS_KEY,{});sound=settings?.sound!==false;updateSound();
let ranks=read(RANK_KEY,[]);if(!Array.isArray(ranks))ranks=[];
ranks=ranks.filter(r=>r&&typeof r.name==='string'&&r.name.length<=18&&Number.isInteger(r.score)&&r.score>=0&&r.score<=1e9&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=10&&typeof r.won==='boolean').sort((a,b)=>b.score-a.score).slice(0,10);
let best=ranks.length?ranks[0].score:0;
function validSave(){const saved=read(SAVE_KEY,null);return saved&&Engine.valid(saved.game)?saved:null;}
function refreshSave(){const saved=validSave();$('continue').disabled=!saved;$('save-info').textContent=saved?`STAGE ${String(saved.game.level+1).padStart(2,'0')} / SCORE ${String(saved.game.score).padStart(6,'0')} から再開`:canSave?'まだ中断データはありません':'保存を利用できません';}
function save(){if(['ready','playing','clear'].includes(engine.status))write(SAVE_KEY,{game:engine.snapshot(),date:Date.now()});}
function showScreen(name){screen=name;for(const id of ['menu','game','ranking','gallery'])$(id).classList.toggle('hidden',id!==name);window.scrollTo(0,0);if(name==='menu')refreshSave();if(name==='ranking')renderRanks();if(name==='gallery')renderGallery();}
function unlockAudio(){if(!sound)return;try{if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
function tone(freq=440,length=.07,type='triangle',gain=.035,delay=0){if(!sound||!audio||audio.state!=='running')return;const t=audio.currentTime+delay,osc=audio.createOscillator(),amp=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);amp.gain.setValueAtTime(gain,t);amp.gain.exponentialRampToValueAtTime(.0001,t+length);osc.connect(amp);amp.connect(audio.destination);osc.start(t);osc.stop(t+length);}
function melody(win=true){[0,1,2,3].forEach((_,i)=>tone((win?[523,659,784,1047]:[392,330,294,196])[i],.22,'triangle',.05,i*.12));}
function updateSound(){$('sound').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));}
$('sound').onclick=()=>{sound=!sound;updateSound();write(SETTINGS_KEY,{sound});if(sound){unlockAudio();tone(660);}};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('全画面にできませんでした。F11でも切り替えられます。');}};
function hideSplash(){const el=$('splash');if(el.classList.contains('hidden'))return;el.classList.add('exit');setTimeout(()=>el.classList.add('hidden'),550);}
$('splash').onclick=hideSplash;setTimeout(hideSplash,1800);
function setFace(name,line,duration=2.2){face=name;faceUntil=performance.now()/1000+duration;$('companion-sprite').src=`assets/${name}.png`;if(line)$('speech').textContent=line;}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),2100);}
function modal({kicker='NOEL / PRISM',title,copy='',sprite,buttons=[],kind}){
 currentModal=kind||'info';keys.clear();lastFocus=document.activeElement;$('modal').classList.remove('hidden');$('modal-kicker').textContent=kicker;$('modal-title').textContent=title;$('modal-copy').replaceChildren();
 if(typeof copy==='string'){const p=document.createElement('p');p.textContent=copy;$('modal-copy').append(p);}else $('modal-copy').append(copy);
 $('modal-sprite').classList.toggle('hidden',!sprite);if(sprite)$('modal-sprite').src=`assets/${sprite}.png`;
 $('modal-buttons').replaceChildren();for(const [label,action,primary] of buttons){const b=document.createElement('button');b.textContent=label;b.className=primary?'primary':'secondary';b.onclick=()=>{unlockAudio();action();};$('modal-buttons').append(b);}
 const first=$('modal-copy').querySelector('input')||$('modal-buttons').querySelector('button');first?.focus();
}
function closeModal(){currentModal=null;$('modal').classList.add('hidden');keys.clear();lastTime=0;lastFocus?.focus?.({preventScroll:true});}
function startGame(){closeModal();engine.newGame();rankingRecorded=false;paused=false;particles=[];texts=[];engine.events=[];showScreen('game');setFace('wave','ようこそ！ クリックでボールを飛ばそう。',3);save();updateHud();draw(0);unlockAudio();melody();}
$('start').onclick=()=>{unlockAudio();if(validSave())modal({kind:'new',title:'新しいゲームを始める？',copy:'現在の中断データは、新しいゲームに置き換わります。ランキングの記録は残ります。',sprite:'focus',buttons:[['新しくスタート',startGame,true],['戻る',closeModal,false]]});else startGame();};
$('continue').onclick=()=>{const saved=validSave();if(!saved){refreshSave();return;}engine.restore(saved.game);rankingRecorded=false;particles=[];texts=[];paused=true;showScreen('game');updateHud();draw(0);unlockAudio();if(engine.status==='clear')stageClear();else modal({kind:'pause',kicker:'WELCOME BACK',title:'おかえりなさい',copy:`ステージ${engine.level+1}、スコア${engine.score}から再開できます。`,sprite:'wave',buttons:[['ゲームを再開',resume,true],['タイトルへ',toMenu,false]]});};
function resume(){closeModal();paused=false;lastTime=0;setFace('focus','ここからもう一度。一緒に行こう。');}
function pauseGame(){if(screen!=='game'||currentModal||!['ready','playing'].includes(engine.status))return;paused=true;save();modal({kind:'pause',kicker:'TAKE A LITTLE BREATH',title:'一時停止',copy:`STAGE ${engine.level+1} / SCORE ${engine.score}\nゲームは保存されています。`,sprite:'bow',buttons:[['再開する',resume,true],['保存してタイトルへ',toMenu,false]]});}
function toMenu(){if(screen==='game')save();closeModal();paused=true;showScreen('menu');}
function activateSkill(){if(screen!=='game'||paused||currentModal)return;if(engine.activateStock()){processEvents();save();updateHud();unlockAudio();}}
$('activate-skill').onclick=activateSkill;
$('release-ball').onclick=()=>{if(screen==='game'&&!paused&&!currentModal){unlockAudio();engine.launch();updateHud();}};
$('pause').onclick=pauseGame;$('brand').onclick=ev=>{ev.preventDefault();if(screen==='game'){if(!currentModal)pauseGame();}else{closeModal();showScreen('menu');}};
$('rank-button').onclick=()=>showScreen('ranking');$('gallery-button').onclick=()=>showScreen('gallery');document.querySelectorAll('.back-button').forEach(b=>b.onclick=()=>showScreen('menu'));
$('help-button').onclick=()=>{
 const copy=document.createElement('div');copy.className='help-text';
 for(const [title,text] of [['MOVE','マウス・左右キー・A / D・タッチでパドルを動かします。'],['LAUNCH','クリック / Spaceで発射。下へ落とすとライフが1減ります。'],['BREAK','連続で壊すとコンボ加点。線のあるブロックは複数回当てて壊します。'],['PRISM DROPS','W：16秒間パドル拡大 / M：ボール追加 / S：12秒間スロー / C：18秒間キャッチ。Cの間はパドルにボールがくっつき、クリック / Spaceで再発射。時間切れで自動発射します。'],['RARE SKILLS','ひし形のN / B / Pを取るとレア技を1つストック。Eキーまたは「スキル発動」で使用します。N：12秒のノエルガード＋5ボール / B：8秒のビーム / P：8秒の貫通。一度に発動する技は1つ。ストック満杯なら新しく拾っても上書きしません。'],['PAUSE & SAVE','Esc / Pで一時停止。自動保存があり、タイトルの「途中から」で再開できます。']]){const p=document.createElement('p'),b=document.createElement('b');b.textContent=title+' — ';p.append(b,document.createTextNode(text));copy.append(p);}
 modal({kind:'help',title:'HOW TO PLAY',copy,buttons:[['準備OK',closeModal,true]]});
};
function renderRanks(){const list=$('rank-list');list.replaceChildren();if(!ranks.length){const p=document.createElement('p');p.className='empty-rank';p.textContent='最初の記録は、あなたのもの。ゲームを遊んでランキングに名前を残そう。';list.append(p);return;}
 ranks.forEach((r,i)=>{const row=document.createElement('div');row.className='rank-row';for(const [text,cls] of [[String(i+1).padStart(2,'0'),'rank-position'],[r.name,'rank-name'],[String(r.score).padStart(6,'0'),'rank-score'],[r.won?'CLEAR':`${r.stage} / 10`,'rank-stage']]){const s=document.createElement('span');s.textContent=text;s.className=cls;row.append(s);}list.append(row);});}
let galleryMade=false;function renderGallery(){if(galleryMade)return;galleryMade=true;sprites.forEach(([name,label,en],i)=>{const card=document.createElement('article');card.className='gallery-card';const num=document.createElement('span');num.className='num';num.textContent=String(i+1).padStart(2,'0')+' / 10';const img=document.createElement('img');img.src=`assets/${name}.png`;img.className='pixel';img.alt=label;const h=document.createElement('h3');h.textContent=label;const p=document.createElement('p');p.textContent=en;card.append(num,img,h,p);$('gallery-grid').append(card);});}
function updateHud(){const [en,jp]=STAGES[engine.level];$('stage-small').textContent=`STAGE ${String(engine.level+1).padStart(2,'0')} / 10 · ${jp}`;$('stage-title').textContent=en;$('score').textContent=String(engine.score).padStart(6,'0');$('best').textContent=String(Math.max(best,engine.score)).padStart(6,'0');$('lives').textContent='◆ '.repeat(engine.lives).trim()||'—';const progress=100*engine.bricks.filter(b=>b.hp===0).length/engine.initialBricks;$('progress').style.width=progress+'%';$('progress-text').textContent=Math.floor(progress)+'%';const held=engine.balls.filter(b=>b.held).length;$('ready-hint').classList.toggle('hidden',(!held&&engine.status!=='ready')||paused||!!currentModal);$('release-ball').classList.toggle('hidden',(!held&&engine.status!=='ready')||paused||!!currentModal);$('ready-hint').textContent=engine.status==='ready'?'クリック / Space でボールを発射':`キャッチ中 ${held}個 · クリック / Space で再発射`;updateSkillHud();$('autosave-label').textContent=canSave?'プレイを自動保存':'保存なしでプレイ中';}
function updateSkillHud(){
 const stock=engine.stock?SKILLS[engine.stock]:null,active=engine.activeSkill();
 $('stock-count').textContent=stock?'1 / 1':'0 / 1';$('stock-emblem').textContent=stock?stock.icon:'◇';$('stock-emblem').style.color=stock?stock.color:'';
 $('stock-name').textContent=stock?stock.name:'ストックなし';$('stock-description').textContent=stock?stock.description:'ひし形のレアアイテムを取ると、技を1つ保存できます。';
 $('skill-active').textContent=active?`${SKILLS[active.kind].name} · あと${Math.ceil(active.remaining)}秒`:stock?'いつでも発動できます':'好きなタイミングで発動';
 $('activate-skill').disabled=!stock||!!active||paused||!!currentModal||!['ready','playing'].includes(engine.status);
 $('activate-skill').classList.toggle('stock-ready',!!stock&&!active);
}
function stageClear(){paused=true;save();melody();modal({kind:'clear',kicker:`STAGE ${String(engine.level+1).padStart(2,'0')} COMPLETE`,title:'プリズムがきらめいた！',copy:`SCORE ${engine.score} — 次は「${STAGES[Math.min(9,engine.level+1)][1]}」。`,sprite:'victory',buttons:[['次のステージへ',()=>{closeModal();engine.nextStage();paused=false;particles=[];setFace('magic','新しいプリズム、見つけよう。',3);save();updateHud();},true],['保存してタイトルへ',toMenu,false]]});}
function endGame(won){paused=true;remove(SAVE_KEY);refreshSave();melody(won);const copy=document.createElement('div');const score=document.createElement('div');score.className='modal-score';score.textContent=String(engine.score).padStart(6,'0');const p=document.createElement('p');p.textContent=won?'10ステージ、完全クリア！ あなたの名前を記録に残そう。':'ここまでの記録をランキングに残そう。';const input=document.createElement('input');input.maxLength=18;input.value=typeof settings?.name==='string'?settings.name.slice(0,18):'MARIO';input.setAttribute('aria-label','ランキングに残す名前');input.placeholder='名前（18文字まで）';copy.append(score,p,input);
 const register=()=>{if(rankingRecorded)return;rankingRecorded=true;const name=input.value.trim().slice(0,18)||'PLAYER';ranks.push({name,score:engine.score,stage:engine.level+1,won,date:Date.now()});ranks.sort((a,b)=>b.score-a.score);ranks=ranks.slice(0,10);write(RANK_KEY,ranks);write(SETTINGS_KEY,{sound,name});best=ranks[0]?.score||0;closeModal();showScreen('ranking');};
 modal({kind:'end',kicker:won?'ALL PRISMS RESTORED':'THANK YOU FOR PLAYING',title:won?'NOEL FINALE':'また、一緒に。',copy,sprite:won?'victory':'bow',buttons:[['ランキングに記録',register,true],['記録せずタイトルへ',()=>{closeModal();showScreen('menu');},false]]});
}
function burst(x,y,color,count=12){for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,speed=30+Math.random()*130;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.35+Math.random()*.4,max:.75,color,size:2+Math.random()*3});}if(particles.length>450)particles.splice(0,particles.length-450);}
function processEvents(){for(const e of engine.events.splice(0)){
 if(e.type==='brick'){const color=['#eac58c','#efa3b9','#87d8d4','#baa5db'][e.row%4];burst(e.x,e.y,color,e.broken?15:6);texts.push({x:e.x,y:e.y,text:'+'+e.points,life:.8,color});tone(440+Math.min(15,e.combo)*35,.06,'triangle');if(e.combo>=4&&e.combo%4===0){setFace('cheer',`${e.combo}コンボ！ いい調子！`);toast(`${e.combo} COMBO`);shake=3;}}
 if(e.type==='paddle'){tone(220,.055,'sine');burst(engine.paddle.x,PADDLE_Y,'#eac58c',4);}
 if(e.type==='wall')tone(160,.03,'sine',.015);
 if(e.type==='miss'){setFace('sad','大丈夫、まだチャンスはあるよ。',3);shake=8;tone(140,.3,'triangle');toast('ライフが減りました · クリックで再発射');save();}
 if(e.type==='power'){const desc={wide:['smile','WIDE PADDLE','パドルが広がったよ！'],multi:['surprise','MULTI BALL','ボールが増えた！ 全部追いかけて！'],slow:['magic','SLOW TIME','ちょっとだけ、時間をゆっくりに。'],catch:['smile','CATCH & RELEASE · 18s','キャッチできるよ！ クリックでまた飛ばしてね。']}[e.kind];setFace(desc[0],desc[2],3);toast(desc[1]);tone(880,.2,'triangle');}
 if(e.type==='catch'){setFace('smile','つかまえた！ クリック / Spaceで再発射。');tone(500,.12,'sine');}
 if(e.type==='stock'){setFace('magic',`${SKILLS[e.kind].name}をストック！ 好きなときに使ってね。`,3);toast(`RARE STOCK · ${SKILLS[e.kind].name}`);melody();save();}
 if(e.type==='stock-full'){toast('ストックは1つまで · 手持ちの技をキープしました');}
 if(e.type==='skill'){setFace('magic',`${SKILLS[e.kind].name}、いくよ！`,3);toast(SKILLS[e.kind].en);shake=7;melody();}
 if(e.type==='beam-shot')tone(780,.045,'sawtooth',.015);
 if(e.type==='guard-bounce'){burst(e.x,GUARD_Y,'#f3a5b8',5);tone(330,.06,'sine',.02);}
 if(e.type==='clear')stageClear();if(e.type==='won')endGame(true);if(e.type==='over')endGame(false);
}}
function draw(t){
 ctx.clearRect(0,0,W,H);ctx.save();if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.86;if(shake<.2)shake=0;}
 const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#191522');grad.addColorStop(1,'#0d1420');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#eac58c08';ctx.lineWidth=1;for(let x=LEFT;x<=RIGHT;x+=32){ctx.beginPath();ctx.moveTo(x,TOP);ctx.lineTo(x,H-25);ctx.stroke();}for(let y=TOP;y<H-25;y+=32){ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(RIGHT,y);ctx.stroke();}
 // A subtle orbital mark, drawn behind the playfield.
 ctx.strokeStyle='#eac58c10';for(const radius of [145,185]){ctx.beginPath();ctx.arc(W/2,400,radius,0,Math.PI*2);ctx.stroke();}
 ctx.font='italic 150px Georgia';ctx.textAlign='center';ctx.fillStyle='#eac58c08';ctx.fillText('N',W/2,450);ctx.font='10px monospace';ctx.fillStyle='#80738355';ctx.fillText('N O E L   /   P R I S M',W/2,476);
 ctx.strokeStyle='#eac58c55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(LEFT,H-32);ctx.lineTo(LEFT,TOP);ctx.lineTo(RIGHT,TOP);ctx.lineTo(RIGHT,H-32);ctx.stroke();
 const palette=['#eac58c','#e7a1b8','#87cfcd','#a995ca','#c8b09b','#89a6cb'];
 for(const b of engine.bricks){if(b.hp<=0)continue;const color=palette[(b.row+Math.floor(engine.level/2))%palette.length];ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.shadowBlur=0;ctx.fillStyle='#ffffff45';ctx.fillRect(b.x,b.y,b.w,3);ctx.fillStyle='#00000030';ctx.fillRect(b.x,b.y+b.h-4,b.w,4);if(b.hp>1){ctx.fillStyle='#15132166';for(let i=0;i<b.hp-1;i++)ctx.fillRect(b.x+12+i*14,b.y+9,8,4);}}
 if(engine.guardUntil>engine.elapsed){
  const img=images.guard;ctx.save();ctx.imageSmoothingEnabled=false;
  if(img.complete&&img.naturalWidth){const width=RIGHT-LEFT-8,height=width*img.naturalHeight/img.naturalWidth;ctx.globalAlpha=.95;ctx.drawImage(img,LEFT+4,H-height-2,width,height);ctx.globalAlpha=1;}
  const floor=ctx.createLinearGradient(LEFT,0,RIGHT,0);floor.addColorStop(0,'#87d8d4');floor.addColorStop(.5,'#f3a5b8');floor.addColorStop(1,'#eac58c');ctx.strokeStyle=floor;ctx.shadowBlur=17;ctx.shadowColor='#f3a5b8';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(LEFT,GUARD_Y);ctx.lineTo(RIGHT,GUARD_Y);ctx.stroke();ctx.restore();
 }
 for(const d of engine.drops){if(RARE_KINDS.includes(d.kind)){const info=SKILLS[d.kind];ctx.save();ctx.translate(d.x,d.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#201927';ctx.fillRect(-15,-15,30,30);ctx.strokeStyle=info.color;ctx.shadowColor=info.color;ctx.shadowBlur=14;ctx.strokeRect(-15,-15,30,30);ctx.restore();ctx.font='bold 15px monospace';ctx.fillStyle=info.color;ctx.fillText(info.icon,d.x,d.y+5);continue;}const color=d.kind==='wide'?'#f3a5b8':['multi','catch'].includes(d.kind)?'#87d8d4':'#eac58c';ctx.fillStyle='#121722';ctx.fillRect(d.x-13,d.y-13,26,26);ctx.strokeStyle=color;ctx.strokeRect(d.x-13,d.y-13,26,26);ctx.font='bold 15px monospace';ctx.fillStyle=color;ctx.fillText({wide:'W',multi:'M',slow:'S',catch:'C'}[d.kind],d.x,d.y+5);}
 for(const beam of engine.beams){ctx.shadowColor='#87d8d4';ctx.shadowBlur=18;ctx.fillStyle='#87d8d4';ctx.fillRect(beam.x-3,beam.y-22,6,22);ctx.fillStyle='#efffff';ctx.fillRect(beam.x-1,beam.y-22,2,22);ctx.shadowBlur=0;}
 for(const b of engine.balls){b.trail.forEach((p,i)=>{ctx.globalAlpha=i/b.trail.length*.25;ctx.fillStyle='#fff0ce';ctx.fillRect(p.x-R/2,p.y-R/2,R,R);});ctx.globalAlpha=1;ctx.shadowColor=engine.pierceUntil>engine.elapsed?'#f3a5b8':'#ffe5aa';ctx.shadowBlur=engine.pierceUntil>engine.elapsed?30:19;ctx.fillStyle=engine.pierceUntil>engine.elapsed?'#fcaac2':'#fff1d7';ctx.beginPath();ctx.arc(b.x,b.y,R,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffffff';ctx.fillRect(b.x-2,b.y-3,3,3);}
 const p=engine.paddle;ctx.shadowBlur=20;ctx.shadowColor=engine.wideUntil>engine.elapsed?'#f3a5b8':'#eac58c';ctx.fillStyle=engine.wideUntil>engine.elapsed?'#f3a5b8':'#eac58c';ctx.fillRect(p.x-p.width/2,PADDLE_Y,p.width,12);ctx.shadowBlur=0;ctx.fillStyle='#fff8';ctx.fillRect(p.x-p.width/2+4,PADDLE_Y+2,p.width-8,2);ctx.fillStyle='#514152';ctx.fillRect(p.x-18,PADDLE_Y+4,36,4);
 if(engine.catchUntil>engine.elapsed){ctx.strokeStyle='#87d8d4';ctx.lineWidth=2;ctx.strokeRect(p.x-p.width/2-3,PADDLE_Y-3,p.width+6,18);ctx.font='9px monospace';ctx.fillStyle='#87d8d4';ctx.fillText('CATCH',p.x,PADDLE_Y+31);}
 for(const item of particles){ctx.globalAlpha=clamp(item.life/item.max,0,1);ctx.fillStyle=item.color;ctx.fillRect(item.x,item.y,item.size,item.size);}ctx.globalAlpha=1;
 ctx.font='bold 13px monospace';for(const text of texts){ctx.globalAlpha=clamp(text.life/.8,0,1);ctx.fillStyle=text.color;ctx.fillText(text.text,text.x,text.y);}ctx.globalAlpha=1;
 ctx.font='9px monospace';ctx.textAlign='left';ctx.fillStyle='#948391';ctx.fillText(`PRISM ${String(engine.level+1).padStart(2,'0')} / 10`,LEFT+12,TOP+22);ctx.textAlign='right';ctx.fillText('NOEL ARCADE SYSTEM',RIGHT-12,TOP+22);
 if(engine.wideUntil>engine.elapsed||engine.slowUntil>engine.elapsed||engine.catchUntil>engine.elapsed){ctx.fillStyle='#87d8d4';ctx.textAlign='left';ctx.fillText([engine.wideUntil>engine.elapsed?`W ${Math.ceil(engine.wideUntil-engine.elapsed)}s`:'',engine.slowUntil>engine.elapsed?`S ${Math.ceil(engine.slowUntil-engine.elapsed)}s`:'',engine.catchUntil>engine.elapsed?`C ${Math.ceil(engine.catchUntil-engine.elapsed)}s`:''].filter(Boolean).join('   '),LEFT+10,H-16);}
 ctx.restore();
}
function pointer(ev){const rect=canvas.getBoundingClientRect();engine.target((ev.clientX-rect.left)/rect.width*W);}
canvas.addEventListener('pointermove',pointer);canvas.addEventListener('pointerdown',ev=>{ev.preventDefault();canvas.setPointerCapture(ev.pointerId);pointer(ev);unlockAudio();if(!paused&&!currentModal){engine.launch();updateHud();}});
window.addEventListener('keydown',ev=>{
 if(!$('splash').classList.contains('hidden')){hideSplash();return;}
 if(currentModal){if(ev.key==='Tab'){const controls=[...$('modal').querySelectorAll('button,input')];if(!controls.length)return;const first=controls[0],last=controls.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}if(ev.key==='Escape'&&currentModal==='pause'){ev.preventDefault();resume();}else if(ev.key==='Escape'&&['help','new'].includes(currentModal))closeModal();return;}
 if(screen!=='game')return;
 if(['ArrowLeft','ArrowRight',' ','Escape'].includes(ev.key))ev.preventDefault();
 if(['e','E'].includes(ev.key)){ev.preventDefault();if(!ev.repeat){unlockAudio();activateSkill();}return;}
 if(['Escape','p','P'].includes(ev.key)){if(!ev.repeat)pauseGame();return;}
 keys.add(ev.key.toLowerCase());if(ev.key===' '&&!paused){unlockAudio();engine.launch();updateHud();}
});
window.addEventListener('keyup',ev=>keys.delete(ev.key.toLowerCase()));
function autoPause(){keys.clear();if(screen==='game'&&!currentModal&&!paused)pauseGame();}
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});window.addEventListener('pagehide',()=>{if(screen==='game')save();});
function frame(timestamp){const dt=lastTime?Math.min(.05,(timestamp-lastTime)/1000):0;lastTime=timestamp;
 if(screen==='game'){
  if(!paused&&!currentModal){let dir=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);if(dir)engine.target(engine.paddle.x+dir*850*dt);engine.update(dt);processEvents();saveTime+=dt;if(saveTime>2){save();saveTime=0;}
   for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;}particles=particles.filter(p=>p.life>0);for(const text of texts){text.life-=dt;text.y-=35*dt;}texts=texts.filter(t=>t.life>0);
  }
  if(timestamp/1000>faceUntil&&face!=='idle'){face='idle';$('companion-sprite').src='assets/idle.png';$('speech').textContent=engine.status==='ready'?'準備ができたら、ボールを飛ばそう。':'その調子。プリズムを集めよう。';}
  updateHud();draw(timestamp/1000);
 }
 requestAnimationFrame(frame);
}
refreshSave();showScreen('menu');requestAnimationFrame(frame);
// Exposed for reproducible local verification, not used by the UI.
window.NoelApp={engine,showScreen,startGame,pauseGame,resume,save,validSave,activateSkill,get screen(){return screen;},get paused(){return paused;}};
})();
