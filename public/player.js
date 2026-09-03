
const socket=io({reconnection:true,reconnectionAttempts:8,reconnectionDelay:500,reconnectionDelayMax:2500}),$=s=>document.querySelector(s);
let code=null,state=null,priv={hand:[]},sel=new Set(),tick=null,soundOn=localStorage.getItem("cardhall_sound")!=="0",myPid=null;
let audioCtx=null,audioUnlocked=false,lastCountdownSecond=null,lastTurnSecond=null,mjBusy=false,lastTurnPid=null,lastStatus=null;
const qp=new URLSearchParams(location.search);if(qp.get("room")){$("#code").value=qp.get("room");$("#code").readOnly=true}
$("#name").value=localStorage.getItem("cardhall_name")||"";syncSound();
let joinedRoom=false;
socket.on("disconnect",()=>{if(joinedRoom)toast("連線不穩，正在重新連線…")});
socket.io.on("reconnect",()=>{const pid=sessionStorage.getItem("cardhall_pid"),rc=sessionStorage.getItem("cardhall_room");if(joinedRoom&&pid&&rc)socket.emit("resumeRoom",{code:rc,pid})});
socket.on("resumeFailed",()=>{joinedRoom=false;sessionStorage.removeItem("cardhall_pid");sessionStorage.removeItem("cardhall_room");toast("連線已中斷，請重新加入房間")});

function toast(m){const n=$("#notice");n.textContent=m;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1700)}
$("#join").onclick=()=>{const c=$("#code").value.trim(),name=$("#name").value.trim(),password=$("#pwd").value;localStorage.setItem("cardhall_name",name);socket.emit("joinRoom",{code:c,name,password})};
$("#soundBtn").onclick=async()=>{soundOn=!soundOn;localStorage.setItem("cardhall_sound",soundOn?"1":"0");syncSound();if(soundOn){await unlockAudio();beep("click")}};
$("#cancelBtn").onclick=()=>{sel.clear();renderHand()};
$("#playBtn").onclick=()=>{if(!state)return;if(state.game==="sevens"){if(sel.size!==1)return toast("請選一張牌");socket.emit("sevenAction",{code,id:[...sel][0],cover:false})}else socket.emit("playCards",{code,ids:[...sel]})};
$("#coverBtn").onclick=()=>{if(sel.size!==1)return toast("請選一張要蓋掉的牌");socket.emit("sevenAction",{code,id:[...sel][0],cover:true})};
$("#passBtn").onclick=()=>socket.emit("pass",{code});
$("#specialBtn").onclick=()=>{
 if(!state)return;
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
socket.on("errorMsg",toast);
socket.on("kicked",()=>{joinedRoom=false;alert("你已被主控踢出房間");location.href="player.html"});
socket.on("roomDeleted",()=>{joinedRoom=false;alert("房間已被主控刪除");location.href="player.html"});
socket.on("joined",x=>{code=x.code;myPid=x.pid;joinedRoom=true;sessionStorage.setItem("cardhall_pid",myPid);sessionStorage.setItem("cardhall_room",code);$("#roomCode").textContent=code;$("#joinWrap").classList.add("hidden");$("#gameWrap").classList.remove("hidden");toast("已加入房間")});
socket.on("privateState",p=>{priv=p;myPid=p.pid;mjBusy=false;if(sel.size&&![...sel].some(k=>p.hand?.some(c=>(c.uid||c.id)===k)))sel.clear();renderHand();renderButtons()});
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
   if(e.action==="pass"){beep("pass");return}
   if(e.action==="win"){beep("win");speak(`${e.playerName||"玩家"}獲勝`);return}
   beep("card");
   const cs=e.cards||[];
   if(e.type==="單張"&&cs[0])speak(cardVoice(cs[0]));
   else if(e.type==="對子"&&cs[0])speak(`一對${rankName(cs[0].rank)}`);
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
 if(e.game==="landlord"){
   if(e.action==="pass"){beep("pass");return}
   if(e.action==="win"){beep("win");speak(`${e.playerName||"玩家"}獲勝`);return}
   beep(e.type==="炸彈"||e.type==="王炸"?"bomb":"card");return;
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
 for(const g of ["big2","sevens","chinese","landlord","mahjong"])document.body.classList.toggle("game-"+g,state.game===g);
 $("#gameName").textContent=state.gameName;$("#online").textContent=`${state.connectedCount}/${state.needPlayers}`;$("#round").textContent=`${state.round}/${state.totalRounds}`;
 $("#seats").innerHTML=Array.from({length:state.needPlayers},(_,i)=>state.players[i]?`<div class="pseat ${i===state.currentTurn?"turn":""} ${state.players[i].connected?"":"off"}">👤 ${esc(state.players[i].name)}<br><span class="statusdot">${state.players[i].connected?"🟢":"⚪"}｜🏆 ${state.players[i].wins} 勝${state.status==="playing"?"｜剩 "+state.players[i].count:""}${state.players[i].covered?`｜蓋 ${state.players[i].covered}`:""}</span>${state.game==="mahjong"&&state.players[i].melds?.length?`<div class="meldMini">${state.players[i].melds.map(m=>m.tiles.map(t=>`<img src="tiles/${t.id}.svg">`).join("")).join("")}</div>`:""}</div>`:`<div class="pseat off">等待玩家</div>`).join("");
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
 $("#coverBtn").classList.toggle("hidden",state.game!=="sevens");$("#passBtn").classList.toggle("hidden",!["big2","landlord"].includes(state.game));$("#playBtn").classList.toggle("hidden",["chinese","mahjong"].includes(state.game));
 const myTurn=isMyTurn();
 if(["big2","sevens","landlord"].includes(state.game)){
   $("#playBtn").disabled=!myTurn;
   $("#coverBtn").disabled=!myTurn;
   $("#passBtn").disabled=!myTurn||!state.lastPlay;
 }
 const sp=$("#specialBtn");sp.classList.toggle("hidden",!["chinese","mahjong"].includes(state.game));sp.textContent=state.game==="chinese"?"排牌／確認":state.game==="mahjong"?"打出選取牌":"";
 const o=priv.mahjongOptions||{},mj=state.game==="mahjong";
 if(mj){
   const myTurn=state.status==="playing"&&!state.mahjongReaction&&state.players?.[state.currentTurn]?.pid===myPid;
   sp.disabled=!myTurn||sel.size!==1;
   sp.title=myTurn?(sel.size===1?"打出目前選取的牌":"先點一張牌"):"還沒輪到你";
 }else sp.disabled=false;
 const mb=[["#mjWinBtn",!!(o.selfWin||o.win)],["#mjPongBtn",!!o.pong],["#mjKongBtn",!!(o.kong||(o.concealedKongs||[]).length)],["#mjChowBtn",!!(o.chows||[]).length],["#mjPassBtn",!!o.canPass]];
 mb.forEach(([q,on])=>{const b=$(q);b.classList.toggle("hidden",!mj);b.disabled=!on||mjBusy;b.classList.toggle("mjReady",!!on&&!mjBusy)});

}
function renderBoard(){
 const b=$("#board");
 if(["big2","landlord"].includes(state.game)){
   const bottom=state.game==="landlord"&&state.board?.bottomCards?.length?`<div class="ddzBottom"><b>地主底牌</b>${state.board.bottomCards.map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join("")}</div>`:"";
   const play=state.lastPlay?big2DisplayCards(state.lastPlay.cards,state.lastPlay.type).map(c=>`<img class="cardOut" src="cards/${c.id}.svg">`).join(""):"桌面尚無牌";
   b.innerHTML=bottom+`<div>${play}</div>`;
 }
 else if(state.game==="sevens"){let h="";const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],sn={C:"♣",D:"♦",H:"♥",S:"♠"};for(const su of ["C","D","H","S"]){const a=state.board?.[su]||[],m=new Map(a.map(c=>[c.rank,c]));h+=`<div class="sevenLane"><b>${sn[su]}</b><div class="sevenSlots">${ranks.map(r=>m.has(r)?`<img class="cardOut" src="cards/${m.get(r).id}.svg">`:`<span class="sevenEmpty"></span>`).join("")}</div></div>`}b.innerHTML=h}
 else if(state.game==="mahjong"){const ds=(state.board?.discards||[]).slice(-36),last=state.board?.lastDiscard?.tile?.uid;b.innerHTML=`${state.mahjongReaction?`<div class="reactionText">等待可操作玩家選擇 吃／碰／槓／胡／過</div>`:""}<div class="discardGrid">${ds.map(x=>`<img class="${x.tile.uid===last?"latestDiscard":""}" src="tiles/${x.tile.id}.svg">`).join("")}</div>`}
 else b.innerHTML="十三支：完成排牌後等待其他玩家";
}
function sevenSort(h){const r={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},s={C:0,D:1,H:2,S:3};return [...h].sort((a,b)=>s[a.suit]-s[b.suit]||r[a.rank]-r[b.rank])}
function sevenLegalClient(c){const a=state?.board?.[c.suit]||[],o={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},v=o[c.rank];if(!a.length)return c.rank==="7";const z=a.map(x=>o[x.rank]);return v===Math.min(...z)-1||v===Math.max(...z)+1}
function sevenHandSort(h){const ro={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},so={C:0,D:1,H:2,S:3};return [...h].sort((a,b)=>so[a.suit]-so[b.suit]||ro[a.rank]-ro[b.rank])}
function sevenLegalClient(c){const a=state?.board?.[c.suit]||[],o={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},v=o[c.rank];if(!a.length)return c.rank==="7";const z=a.map(x=>o[x.rank]);return v===Math.min(...z)-1||v===Math.max(...z)+1}
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
   const canPick=state?.game==="chinese"||isMyTurn();
   el.classList.toggle("handLocked",!canPick&&["big2","sevens","landlord"].includes(state?.game));
   el.innerHTML=h.map((c,i)=>`<img class="card ${sel.has(c.id)?"sel":""} ${state?.game==="sevens"&&sevenLegalClient(c)?"legal":""} ${state?.game==="sevens"&&(i===0||h[i-1].suit!==c.suit)?"suitStart":""} ${!canPick&&["big2","sevens","landlord"].includes(state?.game)?"locked":""}" data-id="${c.id}" data-suit="${c.suit}" src="cards/${c.id}.svg">`).join("");
   el.querySelectorAll(".card").forEach(x=>x.onclick=()=>{if(!canPick)return;const id=x.dataset.id;sel.has(id)?sel.delete(id):sel.add(id);renderHand();renderButtons()});
   fitBig2PortraitHand(el,h.length);
 }
}
function fitBig2PortraitHand(el,count){
 if(state?.game!=="big2"||!matchMedia("(max-width:600px) and (orientation:portrait)").matches||!count){el.style.removeProperty("--big2-card-margin");return}
 const w=62,avail=Math.max(250,el.clientWidth-12);
 let margin=0;if(count>1){const step=(avail-w)/(count-1);margin=Math.min(0,Math.max(-39,step-w))}
 el.style.setProperty("--big2-card-margin",`${margin}px`);
}
window.addEventListener("resize",()=>{if(state?.game==="big2")fitBig2PortraitHand($("#hand"),(priv.hand||[]).length)});
function renderResult(){if(["round_end","finished"].includes(state.status)&&state.winner){$("#result").classList.remove("hidden");$("#resultTitle").textContent=state.status==="finished"?"本場結束":"回合結束";$("#winnerText").innerHTML=`<h2>${esc(state.winner.name)} 獲勝</h2>`;$("#ranking").innerHTML=(state.ranking||[]).map(x=>`<div class="rankrow"><span>${x.rank}. ${esc(x.name)}</span><b>🏆 ${x.wins} 勝</b></div>`).join("");$("#nextText").textContent=state.status==="round_end"?`約 ${state.betweenSeconds} 秒後進入下一回合`:(state.continuous?`約 ${state.betweenSeconds} 秒後開始新一場`:"")}else $("#result").classList.add("hidden")}
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
   $("#timer").textContent="";lastTurnSecond=null;
 },120)
}
function rule(g){if(g==="big2")return "大老二：3 最小、2 最大；花色 ♣<♦<♥<♠；持有 ♣3 者先出，第一手需含 ♣3。五張牌必須同牌型才能壓。順子 A2345 最小，23456 最大。沒有出牌倒數，輪到玩家時等待玩家自行操作。";if(g==="sevens")return "接龍：持有 ♠7 者先出。每個花色從 7 往上或往下接；如果手上沒有任何合法牌，必須選一張蓋牌。全部玩家處理完手牌後，以蓋牌最少者獲勝。";if(g==="chinese")return "十三支：13 張分成前3、中5、後5。可手動分墩或套用推薦排法，確認提交前可自由調整；後墩需 ≥ 中墩 ≥ 前墩。";if(g==="landlord")return "鬥地主公開測試：54 張（52 張＋小王＋大王）；3 人各 17 張，系統隨機地主後取得 3 張底牌。支援單張、對子、三條、三帶一、三帶二、順子、連對、無翅膀飛機、炸彈、王炸。2 與大小王不能放進順子／連對／飛機。";return "麻將：台灣 16 張。每人平常 16 張，摸牌後 17 張再打一張。支援吃、碰、明槓、暗槓、自摸、別人打出的牌胡牌與過；吃只能吃上家打出的牌。吃碰槓後會顯示在副露區。胡牌基本結構為五組面子＋一對將。"}
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
