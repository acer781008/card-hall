
const socket=io({reconnection:true,reconnectionAttempts:8,reconnectionDelay:500,reconnectionDelayMax:2500}),$=s=>document.querySelector(s);
let code=null,state=null,priv={hand:[]},sel=new Set(),tick=null,soundOn=localStorage.getItem("cardhall_sound")!=="0",myPid=null;
let audioCtx=null,audioUnlocked=false,lastCountdownSecond=null,lastTurnSecond=null,mjBusy=false,lastTurnPid=null,lastStatus=null,pendingSeven=null,pendingPlay=null;
const qp=new URLSearchParams(location.search);if(qp.get("room")){$("#code").value=qp.get("room");$("#code").readOnly=true}
$("#name").value=localStorage.getItem("cardhall_name")||"";syncSound();
let joinedRoom=false;
socket.on("disconnect",()=>{if(joinedRoom)toast("連線不穩，正在重新連線…")});
socket.io.on("reconnect",()=>{const pid=sessionStorage.getItem("cardhall_pid"),rc=sessionStorage.getItem("cardhall_room");if(joinedRoom&&pid&&rc)socket.emit("resumeRoom",{code:rc,pid})});
socket.on("resumeFailed",()=>{joinedRoom=false;sessionStorage.removeItem("cardhall_pid");sessionStorage.removeItem("cardhall_room");toast("連線已中斷，請重新加入房間")});

function toast(m){const n=$("#notice");n.textContent=m;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1700)}
$("#join").onclick=async()=>{if(soundOn)await unlockAudio();const c=$("#code").value.trim(),name=$("#name").value.trim(),password=$("#pwd").value;localStorage.setItem("cardhall_name",name);socket.emit("joinRoom",{code:c,name,password})};
$("#soundBtn").onclick=async()=>{soundOn=!soundOn;localStorage.setItem("cardhall_sound",soundOn?"1":"0");syncSound();if(soundOn){await unlockAudio();beep("click")}};
$("#cancelBtn").onclick=()=>{sel.clear();renderHand()};
function optimisticSeven(cover){if(pendingSeven)return;if(sel.size!==1)return toast(cover?"請選一張要蓋掉的牌":"請選一張牌");const id=[...sel][0],card=priv.hand?.find(c=>c.id===id);if(!card)return;pendingSeven={priv:structuredClone(priv),state:structuredClone(state)};priv.hand=priv.hand.filter(c=>c.id!==id);if(!cover){state.board=state.board||{C:[],D:[],H:[],S:[]};state.board[card.suit]=[...(state.board[card.suit]||[]),card]}sel.clear();renderState();socket.emit("sevenAction",{code,id,cover});setTimeout(()=>{if(pendingSeven){priv=pendingSeven.priv;state=pendingSeven.state;pendingSeven=null;renderState()}},2500)}
$("#playBtn").onclick=()=>{if(!state)return;if(state.game==="sevens")return optimisticSeven(false);const ids=[...sel];if(["ninety9","redpoint"].includes(state.game)&&ids.length!==1)return toast("請選一張牌");if(!ids.length)return toast("請先選牌");if(state.game==="ninety9"&&state.ninety9Mode==="special")return play99Special(ids[0]);if(["big2","ninety9","redpoint"].includes(state.game)){pendingPlay=structuredClone(priv);priv.hand=priv.hand.filter(c=>!ids.includes(c.id));sel.clear();renderHand()}socket.emit("playCards",{code,ids});setTimeout(()=>{if(pendingPlay){priv=pendingPlay;pendingPlay=null;renderHand()}},2200)};
function play99Special(id){const c=(priv.hand||[]).find(x=>x.id===id);if(!c)return;if(c.rank==="10"||c.rank==="Q"){const n=c.rank==="10"?10:20;const minus=confirm(`這張 ${c.rank}：按「確定」減 ${n}；按「取消」加 ${n}`);socket.emit("ninety9Action",{code,id,choice:minus?"minus":"plus"})}else if(c.rank==="5"){const others=(state.players||[]).filter(x=>x.pid!==myPid);const names=others.map((x,i)=>`${i+1}. ${x.name}`).join("\n");const v=prompt(`指定下一位玩家：\n${names}\n請輸入編號`);const t=others[(+v||0)-1];if(!t)return toast("已取消指定");socket.emit("ninety9Action",{code,id,targetPid:t.pid})}else socket.emit("ninety9Action",{code,id});sel.clear();renderHand()}
$("#coverBtn").onclick=()=>optimisticSeven(true);
$("#passBtn").onclick=()=>socket.emit("pass",{code});
$("#specialBtn").onclick=()=>{
 if(!state)return;
 if(state.game==="blackjack"){socket.emit("basicAction",{code,action:"hit"});return}
 if(state.game==="texas"){socket.emit("basicAction",{code,action:"continue"});return}
 if(state.game==="chinese"){openChinese();return}
 if(state.game==="mahjong"){
   if(state.status!=="playing")return toast("遊戲還沒開始");
   if(state.mahjongReaction)return toast("目前正在等待吃／碰／槓／胡／過");
   const me=state.players?.[state.currentTurn];
   if(!me||me.pid!==myPid)return toast("還沒輪到你");
   if(sel.size!==1)return toast("請先點一張麻將牌");
   const tileUid=[...sel][0];
   if(!priv.hand?.some(c=>(c.uid||c.id)===tileUid))return toast("請重新選擇牌");
   socket.emit("mahjongDiscard",{code,uid:tileUid});sel.clear();renderHand();renderButtons();
 }
};
$("#altBtn").onclick=()=>{if(!state)return;if(state.game==="blackjack")socket.emit("basicAction",{code,action:"stand"});else if(state.game==="texas")socket.emit("basicAction",{code,action:"fold"})};
function sendMj(event,payload={}){if(mjBusy)return;mjBusy=true;renderButtons();socket.emit(event,{code,...payload});setTimeout(()=>{mjBusy=false;renderButtons()},900)}
$("#mjWinBtn").onclick=()=>sendMj("mahjongWin");
$("#mjPongBtn").onclick=()=>sendMj("mahjongClaim",{type:"pong"});
$("#mjKongBtn").onclick=()=>{const o=priv.mahjongOptions||{};if(state.mahjongReaction)sendMj("mahjongClaim",{type:"kong"});else if(o.concealedKongs?.length)sendMj("mahjongConcealedKong",{id:o.concealedKongs[0]})};
$("#mjChowBtn").onclick=()=>{const cs=priv.mahjongOptions?.chows||[];if(!cs.length)return;if(cs.length===1)return sendMj("mahjongClaim",{type:"chow",ids:cs[0]});showChowChoices(cs)};
$("#mjPassBtn").onclick=()=>sendMj("mahjongPass");
function showChowChoices(cs){const modal=$("#chowModal"),box=$("#chowChoices");box.innerHTML=cs.map((ids,i)=>`<button class="chowChoice" data-i="${i}">${ids.map(id=>`<span><img src="tiles/${id}.svg"><small>${esc(MJ_NAMES[id]||id)}</small></span>`).join("")}</button>`).join("");modal.classList.remove("hidden");box.querySelectorAll(".chowChoice").forEach(b=>b.onclick=()=>{const pick=cs[+b.dataset.i];modal.classList.add("hidden");sendMj("mahjongClaim",{type:"chow",ids:pick})})}
$("#chowCancel").onclick=()=>$("#chowModal").classList.add("hidden");
$("#rulesBtn").onclick=()=>alert(rule(state.game));
$("#leaveBtn").onclick=()=>{if(confirm("確定離開目前房間？")){joinedRoom=false;sessionStorage.removeItem("cardhall_pid");sessionStorage.removeItem("cardhall_room");socket.emit("leaveRoom",{code});setTimeout(()=>location.href="player.html",150)}};
socket.on("needPassword",()=>$("#pwdWrap").classList.remove("hidden"));
socket.on("errorMsg",m=>{if(pendingSeven){priv=pendingSeven.priv;state=pendingSeven.state;pendingSeven=null;renderState()}if(pendingPlay){priv=pendingPlay;pendingPlay=null;renderHand()}toast(m)});
socket.on("kicked",()=>{joinedRoom=false;alert("你已被主控踢出房間");location.href="player.html"});
socket.on("roomDeleted",()=>{joinedRoom=false;alert("房間已被主控刪除");location.href="player.html"});
socket.on("joined",x=>{code=x.code;myPid=x.pid;joinedRoom=true;sessionStorage.setItem("cardhall_pid",myPid);sessionStorage.setItem("cardhall_room",code);$("#roomCode").textContent=code;$("#joinWrap").classList.add("hidden");$("#gameWrap").classList.remove("hidden");toast("已加入房間")});
socket.on("privateState",p=>{if(pendingSeven)pendingSeven=null;if(pendingPlay)pendingPlay=null;priv=p;myPid=p.pid;mjBusy=false;if(sel.size&&![...sel].some(k=>p.hand?.some(c=>(c.uid||c.id)===k)))sel.clear();renderHand();renderButtons()});
let lastHistLen=0;
socket.on("roomState",s=>{mjBusy=false;if(state&&s.history.length>lastHistLen&&s.status==="playing")beep(s.game==="mahjong"?"tile":"card");lastHistLen=s.history.length;state=s;renderState()});
function syncSound(){$("#soundBtn")&&($("#soundBtn").textContent=soundOn?"🔊 聲音：開":"🔇 聲音：關")}
function getAudio(){
 try{
   if(!audioCtx){const A=window.AudioContext||window.webkitAudioContext;if(A)audioCtx=new A()}
   return audioCtx;
 }catch{return null}
}
async function unlockAudio(){
 const a=getAudio();if(!a)return false;
 try{if(a.state==="suspended")await a.resume();audioUnlocked=a.state==="running";return audioUnlocked}catch{return false}
}
document.addEventListener("pointerdown",()=>{if(soundOn)unlockAudio()},{passive:true});
document.addEventListener("keydown",()=>{if(soundOn)unlockAudio()},{passive:true});

function beep(kind="click"){
 if(!soundOn)return;
 const a=getAudio();if(!a||a.state!=="running")return;
 try{
   const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);
   o.type=["tile","bomb"].includes(kind)?"square":"triangle";
   const f=kind==="win"?820:kind==="bomb"?120:kind==="turn"?660:kind==="countFinal"?760:kind==="count"?520:kind==="tile"?430:kind==="cover"?250:kind==="pass"?300:kind==="submit"?560:kind==="card"?410:340;
   const dur=kind==="win"?.22:kind==="bomb"?.18:kind==="turn"?.11:kind==="countFinal"?.13:kind==="count"?.075:kind==="tile"?.055:.07;
   o.frequency.setValueAtTime(f,a.currentTime);
   g.gain.setValueAtTime(.0001,a.currentTime);
   g.gain.exponentialRampToValueAtTime(kind==="countFinal"?.12:.07,a.currentTime+.008);
   g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur);
   o.start();o.stop(a.currentTime+dur+.01);
 }catch{}
}
const MJ_NAMES={
 "E":"東風","S":"南風","W":"西風","N":"北風","R":"紅中","G":"發財","Wh":"白板"
};
for(const suit of [["m","萬"],["p","筒"],["s","條"]])for(let n=1;n<=9;n++)MJ_NAMES[n+suit[0]]=`${["","一","二","三","四","五","六","七","八","九"][n]}${suit[1]}`;
function speak(text){
 if(!soundOn||!text||!("speechSynthesis"in window))return;
 try{
   const u=new SpeechSynthesisUtterance(text);u.lang="zh-TW";u.rate=1.05;u.pitch=1;u.volume=.9;
   const voices=speechSynthesis.getVoices();const tw=voices.find(v=>/zh[-_]TW/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));if(tw)u.voice=tw;
   speechSynthesis.cancel();speechSynthesis.speak(u);
 }catch{}
}
socket.on("gameSound",e=>{
 if(!soundOn||!e)return;
 const suitName={C:"梅花",D:"方塊",H:"紅心",S:"黑桃"};
 const rankName=r=>String(r||"").toUpperCase();
 const cardVoice=c=>c?`${suitName[c.suit]||""}${rankName(c.rank)}`:"";
 if(e.game==="big2"){
   if(e.action==="pass"){beep("pass");speak("PASS");return}
   if(e.action==="win"){beep("win");speak(`${e.playerName||"玩家"}獲勝`);return}
   beep("card");
   const cs=e.cards||[];
   if(e.type==="單張"&&cs[0])speak(cardVoice(cs[0]));
   else if(e.type==="對子"&&cs[0])speak(`一對${rankName(cs[0].rank)}`);
   else if(e.type==="三條"&&cs[0])speak(`三條${rankName(cs[0].rank)}`);
   else if(["順子","同花","葫蘆","鐵支","同花順"].includes(e.type))speak(e.type);
   return;
 }
 if(e.game==="sevens"){
   if(e.action==="cover"){beep("cover");return}
   if(e.action==="win"){beep("win");speak(`${e.playerName||"玩家"}獲勝`);return}
   beep("card");if(e.card)speak(cardVoice(e.card));return;
 }
 if(e.game==="chinese"){
   if(e.action==="submit"){beep("submit");return}
   if(e.action==="win"){beep("win");speak(`${e.playerName||"玩家"}獲勝`)}return;
 }
  if(e.game!=="mahjong")return;
 if(e.action==="discard"){beep("tile");setTimeout(()=>speak(MJ_NAMES[e.tileId]||e.tileId),45)}
 else if(e.action==="chow"){beep("tile");speak("吃")}
 else if(e.action==="pong"){beep("tile");speak("碰")}
 else if(e.action==="kong"){beep("tile");speak("槓")}
 else if(e.action==="win"){beep("win");speak("胡")}
});
function renderState(){
 const turnPid=state?.status==="playing"&&state?.currentTurn!=null?state.players?.[state.currentTurn]?.pid:null;
 if(soundOn&&turnPid===myPid&&(lastTurnPid!==myPid||lastStatus!=="playing"))beep("turn");
 lastTurnPid=turnPid;lastStatus=state?.status;
 for(const g of ["big2","sevens","chinese","mahjong","ninety9","redpoint","blackjack","texas"])document.body.classList.toggle("game-"+g,state.game===g);
 $("#gameName").textContent=state.gameName;$("#online").textContent=`${state.connectedCount}/${state.needPlayers}`;$("#round").textContent=`${state.round}/${state.totalRounds}`;
 $("#seats").innerHTML=Array.from({length:state.needPlayers},(_,i)=>state.players[i]?`<div class="pseat ${i===state.currentTurn?"turn":""} ${state.players[i].connected?"":"off"}">👤 ${esc(state.players[i].name)}<br><span class="statusdot">${state.players[i].aiTakeover?"🤖 AI代打":state.players[i].connected?"🟢":"⚪"}｜🏆 ${state.players[i].wins} 勝${state.scoreEnabled?`｜⭐ ${state.players[i].points||0} 分`:""}${state.status==="playing"?"｜剩 "+state.players[i].count:""}${state.players[i].covered?`｜蓋 ${state.players[i].covered}`:""}${state.game==="redpoint"?`｜紅 ${state.players[i].redScore||0}`:""}</span>${state.game==="mahjong"&&state.players[i].melds?.length?`<div class="meldMini">${state.players[i].melds.map(m=>m.tiles.map(t=>`<img src="tiles/${t.id}.svg">`).join("")).join("")}</div>`:""}</div>`:`<div class="pseat off">等待玩家</div>`).join("");
 $("#history").innerHTML=[...state.history].reverse().map(x=>`<div class="hist">${esc(x.text)}</div>`).join("");
 if(state.status==="waiting"){const ai=state.aiMode==="auto"&&state.aiFillDeadline?`｜🤖 <span id="aiWaitText"></span>`:"";$("#turnText").innerHTML=`等待玩家（${state.connectedCount}/${state.needPlayers}）${ai}`}else if(state.status==="countdown")$("#turnText").textContent="準備開始";else if(state.status==="playing"){if(state.game==="chinese")$("#turnText").textContent="請完成本回合排牌";else{const p=state.players[state.currentTurn];$("#turnText").textContent=p?(p.pid===myPid?"⬇ 輪到你":"輪到："+p.name):""}}else $("#turnText").textContent="本回合結束";
 $("#countdown").classList.toggle("hidden",state.status!=="countdown");renderBoard();renderButtons();renderResult();startTicker();
}
function isMyTurn(){return !!(state&&state.status==="playing"&&state.players?.[state.currentTurn]?.pid===myPid)}
function big2DisplayCards(cards,type){
 const a=[...(cards||[])],rv={"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14,"2":15},sv={C:0,D:1,H:2,S:3};
 const byRankSuit=(x,y)=>(rv[x.rank]??0)-(rv[y.rank]??0)||(sv[x.suit]??0)-(sv[y.suit]??0);
 if(type==="葫蘆"||type==="鐵支"){const cnt={};a.forEach(c=>cnt[c.rank]=(cnt[c.rank]||0)+1);return a.sort((x,y)=>(cnt[y.rank]-cnt[x.rank])||byRankSuit(x,y))}
 return a.sort(byRankSuit);
}
function renderButtons(){
 const turnGames=["big2","sevens","ninety9","redpoint","blackjack","texas"],myTurn=isMyTurn()&&!(state.game==="redpoint"&&state.board?.phase==="flip");
 $("#coverBtn").classList.toggle("hidden",state.game!=="sevens");$("#passBtn").classList.toggle("hidden",!["big2"].includes(state.game));$("#playBtn").classList.toggle("hidden",["chinese","mahjong","blackjack","texas"].includes(state.game));
 if(turnGames.includes(state.game)){ $("#playBtn").disabled=!myTurn;$("#coverBtn").disabled=!myTurn;$("#passBtn").disabled=!myTurn||!state.lastPlay; }
 const sp=$("#specialBtn"),alt=$("#altBtn");sp.classList.toggle("hidden",!["chinese","mahjong","blackjack","texas"].includes(state.game));alt.classList.toggle("hidden",!["blackjack","texas"].includes(state.game));
 sp.textContent=state.game==="chinese"?"排牌／確認":state.game==="mahjong"?"打出選取牌":state.game==="blackjack"?"要牌":"繼續";alt.textContent=state.game==="blackjack"?"停牌":"棄牌";if(["blackjack","texas"].includes(state.game)){sp.disabled=alt.disabled=!myTurn}
 const o=priv.mahjongOptions||{},mj=state.game==="mahjong";if(mj){const mt=state.status==="playing"&&!state.mahjongReaction&&state.players?.[state.currentTurn]?.pid===myPid;sp.disabled=!mt||sel.size!==1;sp.title=mt?(sel.size===1?"打出目前選取的牌":"先點一張牌"):"還沒輪到你"}else if(!["blackjack","texas"].includes(state.game))sp.disabled=false;
 [["#mjWinBtn",!!(o.selfWin||o.win)],["#mjPongBtn",!!o.pong],["#mjKongBtn",!!(o.kong||(o.concealedKongs||[]).length)],["#mjChowBtn",!!(o.chows||[]).length],["#mjPassBtn",!!o.canPass]].forEach(([q,on])=>{const b=$(q);b.classList.toggle("hidden",!mj);b.disabled=!on||mjBusy;b.classList.toggle("mjReady",!!on&&!mjBusy)});
}
function renderBoard(){
 const b=$("#board");
 if(["big2"].includes(state.game)){
   const bottom=false&&state.board?.bottomCards?.length?`<div class="ddzBottom"><b>地主底牌</b>${state.board.bottomCards.map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join("")}</div>`:"";
   const play=state.lastPlay?big2DisplayCards(state.lastPlay.cards,state.lastPlay.type).map(c=>`<img class="cardOut" src="cards/${c.id}.svg">`).join(""):"桌面尚無牌";
   b.innerHTML=bottom+`<div>${play}</div>`;
 }
 else if(state.game==="sevens"){
   let h="";
   const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],sn={C:"♣",D:"♦",H:"♥",S:"♠"};
   for(const su of ["C","D","H","S"]){
     const a=state.board?.[su]||[],m=new Map(a.map(c=>[c.rank,c]));
     h+=`<div class="sevenLane suit-${su}"><b class="sevenSuit">${sn[su]}</b><div class="sevenSlots">${ranks.map(r=>m.has(r)?`<span class="sevenSlot played"><img class="cardOut" src="cards/${m.get(r).id}.svg" alt="${r}${sn[su]}"></span>`:`<span class="sevenSlot sevenEmpty"><small>${r}</small></span>`).join("")}</div></div>`;
   }
   b.innerHTML=h;
 }
 else if(state.game==="ninety9"){b.innerHTML=`<div class="turnText">目前總點數：<b style="font-size:42px">${state.board?.total??0}</b></div>${state.board?.lastCard?`<img class="cardOut" src="cards/${state.board.lastCard.id}.svg">`:""}`}
 else if(state.game==="redpoint"){const rv=state.board?.revealed;b.innerHTML=`<div><b>桌面牌</b>｜牌堆剩 ${state.board?.deckCount??0} 張</div><div>${(state.board?.table||[]).map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join("")}</div>${rv?`<div class="redFlipBox"><b>🂠 剛翻出的牌</b><div><img class="cardOut redFlipCard" src="cards/${rv.id}.svg"></div></div>`:""}`}
 else if(state.game==="blackjack"){const dealer=state.board?.dealer||[];b.innerHTML=`<div><b>莊家</b>｜${state.status==="playing"?"? 點":dealer.length?dealer.map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join(""):""}</div>`}
 else if(state.game==="texas"){const n=(state.board?.community||[]).length;b.innerHTML=`<div><b>公共牌</b></div><div>${(state.board?.community||[]).slice(0,n).map(c=>`<img class="cardOut" src="cards/${c.id}.svg">`).join("")||"尚未翻牌"}</div>`}
 else if(state.game==="mahjong"){const ds=(state.board?.discards||[]).slice(-36),last=state.board?.lastDiscard?.tile?.uid;b.innerHTML=`${state.mahjongReaction?`<div class="reactionText">等待可操作玩家選擇 吃／碰／槓／胡／過</div>`:""}<div class="discardGrid">${ds.map(x=>`<img class="${x.tile.uid===last?"latestDiscard":""}" src="tiles/${x.tile.id}.svg">`).join("")}</div>`}
 else b.innerHTML="十三支：完成排牌後等待其他玩家";
}
function sevenSort(h){const r={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},s={C:0,D:1,H:2,S:3};return [...h].sort((a,b)=>s[a.suit]-s[b.suit]||r[a.rank]-r[b.rank])}
function sevenLegalClient(c){const a=state?.board?.[c.suit]||[],o={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},v=o[c.rank];if(!a.length)return c.rank==="7";const z=a.map(x=>o[x.rank]);return v===Math.min(...z)-1||v===Math.max(...z)+1}
function sevenHandSort(h){const ro={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},so={C:0,D:1,H:2,S:3};return [...h].sort((a,b)=>so[a.suit]-so[b.suit]||ro[a.rank]-ro[b.rank])}
function renderHand(){
 let h=priv.hand||[],el=$("#hand");if(state?.game==="sevens")h=sevenHandSort(h);
 if(state?.game==="mahjong"){
   const drawnUid=priv.drawnUid||null;
   const ordered=drawnUid?[...h.filter(c=>c.uid!==drawnUid),...h.filter(c=>c.uid===drawnUid)]:[...h];
   el.innerHTML=ordered.map((c,i)=>{const key=c.uid||`${c.id}-${i}`,isDrawn=drawnUid&&c.uid===drawnUid;return `<button type="button" class="tileBtn ${isDrawn?"drawn":""}" data-key="${key}" aria-label="${c.id}">
      ${isDrawn?'<span class="drawnTag">摸</span>':""}<img draggable="false" class="tile ${sel.has(key)?"sel":""}" src="tiles/${c.id}.svg">
   </button>`}).join("");
   el.querySelectorAll(".tileBtn").forEach(btn=>{
     btn.addEventListener("click",e=>{e.preventDefault();const key=btn.dataset.key;sel.clear();sel.add(key);beep("click");renderHand();renderButtons()});
   });
 }else{
   const canPick=state?.game==="chinese"||(isMyTurn()&&!(state?.game==="redpoint"&&state?.board?.phase==="flip"));
   el.classList.toggle("handLocked",!canPick&&["big2","sevens","ninety9","redpoint"].includes(state?.game));
   el.innerHTML=h.map((c,i)=>`<img class="card ${sel.has(c.id)?"sel":""} ${state?.game==="sevens"&&sevenLegalClient(c)?"legal":""} ${state?.game==="sevens"&&(i===0||h[i-1].suit!==c.suit)?"suitStart":""} ${!canPick&&["big2","sevens","ninety9","redpoint"].includes(state?.game)?"locked":""}" data-id="${c.id}" data-suit="${c.suit}" src="cards/${c.id}.svg">`).join("");
   el.querySelectorAll(".card").forEach(x=>x.onclick=()=>{if(!canPick)return;const id=x.dataset.id;sel.has(id)?sel.delete(id):sel.add(id);renderHand();renderButtons()});
   fitBig2PortraitHand(el,h.length);
   fitSevensPortraitHand(el,h);
 }
}

function fitSevensPortraitHand(el,hand){
 if(state?.game!=="sevens"||!matchMedia("(max-width:600px) and (orientation:portrait)").matches||!hand?.length){el.style.removeProperty("--seven-card-margin");return}
 const w=56,avail=Math.max(250,el.clientWidth-12),groups=new Set(hand.map(c=>c.suit)).size,gap=Math.max(0,groups-1)*8;
 let margin=0;if(hand.length>1){const step=(avail-w-gap)/(hand.length-1);margin=Math.min(-18,Math.max(-43,step-w))}
 el.style.setProperty("--seven-card-margin",`${margin}px`);
}
function fitBig2PortraitHand(el,count){
 if(state?.game!=="big2"||!matchMedia("(max-width:600px) and (orientation:portrait)").matches||!count){el.style.removeProperty("--big2-card-margin");return}
 const w=62,avail=Math.max(250,el.clientWidth-12);
 let margin=0;if(count>1){const step=(avail-w)/(count-1);margin=Math.min(0,Math.max(-39,step-w))}
 el.style.setProperty("--big2-card-margin",`${margin}px`);
}
window.addEventListener("resize",()=>{if(state?.game==="big2")fitBig2PortraitHand($("#hand"),(priv.hand||[]).length);if(state?.game==="sevens")fitSevensPortraitHand($("#hand"),sevenHandSort(priv.hand||[]))});
function renderResult(){
 const show=["round_end","finished"].includes(state.status)&&state.winner;if(!show){$("#result").classList.add("hidden");return}
 $("#result").classList.remove("hidden");$("#resultTitle").textContent=state.status==="finished"?"本場結束":"回合結束";$("#winnerText").innerHTML=`<h2>${esc(state.winner.name)} 獲勝</h2>`;
 $("#ranking").innerHTML=(state.ranking||[]).map(x=>`<div class="rankrow"><span>${x.rank}. ${esc(x.name)}</span><b>🏆 ${x.wins} 勝${state.scoreEnabled?`｜⭐ ${x.points||0} 分`:""}</b></div>`).join("");
 const hs=state.resultHands||[];$("#resultHands").innerHTML=hs.length?`<div class="resultHandsTitle">本局公開牌面</div>${hs.map(x=>`<div class="resultHandRow"><b>${esc(x.name)}</b>${x.type?`｜${esc(x.type)}`:""}${x.value!=null?`｜${x.value}點${x.bust?"（爆點）":""}`:""}<div>${(x.cards||[]).map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join("")}</div></div>`).join("")}`:"";
 $("#nextText").textContent=state.status==="round_end"?`⏳ ${state.betweenSeconds} 秒後開始下一回合`:(state.continuous?`⏳ ${state.betweenSeconds} 秒後開始新一場`:"本場已結束，可直接離開房間");
}
function startTicker(){
 if(tick)clearInterval(tick);
 lastCountdownSecond=null;lastTurnSecond=null;
 tick=setInterval(()=>{
   if(!state)return;
   if(state.status==="countdown"){
     const n=Math.max(0,Math.ceil((state.countdownEndsAt-Date.now())/1000));
     $("#countdown").textContent=n||"GO!";
     if(n>0&&n!==lastCountdownSecond){
       lastCountdownSecond=n;
       beep(n<=3?"countFinal":"count");
     }
   }else lastCountdownSecond=null;
   const aiEl=$("#aiWaitText");if(aiEl&&state.aiFillDeadline){const n=Math.max(0,Math.ceil((state.aiFillDeadline-Date.now())/1000));aiEl.textContent=n>0?`還有 ${n} 秒，未滿將自動補齊 AI`:`正在補齊 AI…`;}
   if(state.status==="playing"&&state.turnEndsAt){const n=Math.max(0,Math.ceil((state.turnEndsAt-Date.now())/1000));$("#timer").textContent=`⏱️ ${n} 秒`;if(n<=5&&n!==lastTurnSecond){lastTurnSecond=n;if(n>0){if(soundOn&&audioCtx?.state==="suspended")unlockAudio();beep("count")}}}else{$("#timer").textContent="";lastTurnSecond=null;}
   if(state.status==="round_end"&&state.nextRoundAt){const n=Math.max(0,Math.ceil((state.nextRoundAt-Date.now())/1000));$("#nextText").textContent=`⏳ ${n} 秒後開始下一回合`;}
 },120)
}
function rule(g){if(g==="big2")return `大老二（${state?.big2Mode==="traditional"?"傳統版":"經典版"}）：3 最小、2 最大；花色 ♣<♦<♥<♠；持有 ♣3 者先出，第一手需含 ♣3。${state?.big2Mode==="traditional"?"可單獨出三條，三條只能用更大的三條跟牌。":"不可單獨出三條。"} 鐵支必須是四張同點數＋任意一張，共 5 張；鐵支可跨牌型壓一般牌型；同花順可壓一般牌型與鐵支。順子 A2345 最小，23456 最大。`;if(g==="sevens")return "接龍：持有 ♠7 者先出；同花色從 7 往上／往下接。沒有合法牌時必須蓋牌。最先出完手牌者獲勝 +10 分；其他玩家每剩 1 張牌 -1 分。";if(g==="chinese")return "十三支：13 張分成前3、中5、後5。可手動分墩或套用推薦排法，確認提交前可自由調整；後墩需 ≥ 中墩 ≥ 前墩。";if(g==="mahjong")return "麻將：台灣 16 張。每人平常 16 張，摸牌後 17 張再打一張。支援吃、碰、明槓、暗槓、自摸、別人打出的牌胡牌與過；吃只能吃上家打出的牌。吃碰槓後會顯示在副露區。胡牌基本結構為五組面子＋一對將。";if(g==="ninety9")return state?.ninety9Mode==="special"?"99 特殊牌版：總點數不可超過99。A +1；4 迴轉；5 指定下一位玩家；10 可選 +10/-10；J 跳過；Q 可選 +20/-20；K 直接變成99。":"99 基本版：輪流出一張牌累加點數，總點數不可超過99。";if(g==="redpoint")return "撿紅點：輪到你時先出 1 張手牌；能與海底牌配對就把兩張一起收進得分區，不能配對則出的牌留在海底。接著翻 1 張牌堆牌；能配對就吃走，不能配對則留在海底。A～9 兩張相加必須等於 10；10、J、Q、K 必須相同才能吃。♥♦ 紅牌：A=20 分；2=2 分、3=3 分、4=4 分、5=5 分、6=6 分、7=7 分、8=8 分；9、10、J、Q、K=10 分；♠♣ 黑牌=0 分。整副 52 張全部處理完才結算，紅點總分最高者獲勝。";if(g==="blackjack")return "21點：要牌／停牌，盡量接近 21 點且不可超過。Blackjack +20；一般勝莊家 +10；平手 0；輸莊家或爆牌 -5。";return "德州撲克娛樂制：2 張手牌＋5 張公共牌，以最佳 5 張牌型比大小；可繼續或棄牌。每局贏家 +10，其他玩家 -5；沒有下注或籌碼。"}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

const EMOJIS=["👍","😂","😱","👏","😤","🤔"];
$("#emojiBtn").onclick=()=>{const m=$("#emojiMenu");m.classList.toggle("hidden");m.innerHTML=EMOJIS.map(e=>`<button type="button" class="emojiPick">${e}</button>`).join("");m.querySelectorAll(".emojiPick").forEach(b=>b.onclick=()=>{socket.emit("sendEmoji",{code,emoji:b.textContent});m.classList.add("hidden")})};
socket.on("emoji",e=>{const f=$("#emojiFloat");f.textContent=`${e.name} ${e.emoji}`;f.classList.remove("hidden");clearTimeout(window.__emojiT);window.__emojiT=setTimeout(()=>f.classList.add("hidden"),2400)});

let cz={front:[],middle:[],back:[],pool:[]},czSel=new Set();
function openChinese(){if(state?.game!=="chinese")return;const hand=priv.hand||[];if(!cz.pool.length&&!cz.front.length&&!cz.middle.length&&!cz.back.length)cz={front:[],middle:[],back:[],pool:hand.map(c=>c.id)};renderChinese();$("#chineseModal").classList.remove("hidden")}
function czMove(to){const ids=[...czSel];if(!ids.length)return;for(const k of ["front","middle","back","pool"])cz[k]=cz[k].filter(id=>!czSel.has(id));const cap={front:3,middle:5,back:5,pool:13}[to];if(to!=="pool"&&cz[to].length+ids.length>cap)return toast("這一墩放不下這麼多張");cz[to].push(...ids);czSel.clear();renderChinese()}
function renderChinese(){const by=id=>(priv.hand||[]).find(c=>c.id===id),draw=(ids,zone)=>ids.map(id=>`<img class="czCard ${czSel.has(id)?"sel":""}" data-id="${id}" data-zone="${zone}" src="cards/${id}.svg">`).join("");for(const [id,k] of [["#czFront","front"],["#czMiddle","middle"],["#czBack","back"],["#czPool","pool"]])$(id).innerHTML=draw(cz[k],k);document.querySelectorAll(".czCard").forEach(x=>x.onclick=()=>{const id=x.dataset.id;czSel.has(id)?czSel.delete(id):czSel.add(id);renderChinese()});const rs=priv.chineseRecommendations||[];$("#chineseRecs").innerHTML=rs.map((r,i)=>`<button class="btn recBtn" data-i="${i}">推薦 ${i+1}</button>`).join("");document.querySelectorAll(".recBtn").forEach(b=>b.onclick=()=>{const r=rs[+b.dataset.i];cz={front:r.front.map(c=>c.id),middle:r.middle.map(c=>c.id),back:r.back.map(c=>c.id),pool:[]};czSel.clear();renderChinese()})}
$("#czToFront").onclick=()=>czMove("front");$("#czToMiddle").onclick=()=>czMove("middle");$("#czToBack").onclick=()=>czMove("back");$("#czToPool").onclick=()=>czMove("pool");$("#czClose").onclick=()=>$("#chineseModal").classList.add("hidden");$("#czSubmit").onclick=()=>{if(cz.front.length!==3||cz.middle.length!==5||cz.back.length!==5)return toast("請排成前3、中5、後5");socket.emit("submitChinese",{code,front:cz.front,middle:cz.middle,back:cz.back});$("#chineseModal").classList.add("hidden")};
socket.on("mahjongDiscarded",d=>{const f=$("#mjDiscardFlash");$("#mjDiscardName").textContent=`${d.playerName} 打出`;$("#mjDiscardImg").src=`tiles/${d.tile.id}.svg`;f.classList.remove("hidden");clearTimeout(window.__mjFlashT);window.__mjFlashT=setTimeout(()=>f.classList.add("hidden"),1800)});

document.querySelector("#resultLeaveBtn")?.addEventListener("click",()=>{if(confirm("確定離開目前房間？")){joinedRoom=false;sessionStorage.removeItem("cardhall_pid");sessionStorage.removeItem("cardhall_room");socket.emit("leaveRoom",{code});setTimeout(()=>location.href="player.html",150)}});
