
const socket=io(),$=s=>document.querySelector(s);
let code=null,state=null,priv={hand:[]},sel=new Set(),tick=null,soundOn=localStorage.getItem("cardhall_sound")!=="0",myPid=null;
let audioCtx=null,audioUnlocked=false,lastCountdownSecond=null,lastTurnSecond=null;
const qp=new URLSearchParams(location.search);if(qp.get("room")){$("#code").value=qp.get("room");$("#code").readOnly=true}
$("#name").value=localStorage.getItem("cardhall_name")||"";syncSound();
let everConnected=false;
socket.on("connect",()=>{
  everConnected=true;
  document.body.classList.remove("net-offline");
  const c=sessionStorage.getItem("cardhall_room");
  const name=sessionStorage.getItem("cardhall_join_name");
  const password=sessionStorage.getItem("cardhall_pwd")||"";
  const token=c?savedReconnectToken(c,name):"";
  if(sessionStorage.getItem("cardhall_active")==="1"&&c&&name&&token){
    socket.emit("joinRoom",{code:c,name,password,reconnectToken:token});
  }
});
socket.on("disconnect",()=>{document.body.classList.add("net-offline");toast("連線中斷，正在自動重連…")});
socket.io.on("reconnect",()=>toast("連線已恢復，正在回到原座位…"));

function toast(m){const n=$("#notice");n.textContent=m;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1700)}
function tokenKey(c){return "cardhall_token_"+c}
function persistentTokenKey(c,n){return "cardhall_reconnect_"+c+"_"+String(n||"").trim().toLowerCase()}
function savedReconnectToken(c,n){return sessionStorage.getItem(tokenKey(c))||localStorage.getItem(persistentTokenKey(c,n))||""}
$("#join").onclick=()=>{const c=$("#code").value.trim(),name=$("#name").value.trim(),password=$("#pwd").value;localStorage.setItem("cardhall_name",name);sessionStorage.setItem("cardhall_room",c);sessionStorage.setItem("cardhall_join_name",name);sessionStorage.setItem("cardhall_pwd",password);socket.emit("joinRoom",{code:c,name,password,reconnectToken:savedReconnectToken(c,name)})};
$("#soundBtn").onclick=async()=>{soundOn=!soundOn;localStorage.setItem("cardhall_sound",soundOn?"1":"0");syncSound();if(soundOn){await unlockAudio();beep("click")}};
$("#cancelBtn").onclick=()=>{sel.clear();renderHand()};
$("#playBtn").onclick=()=>{if(!state)return;if(state.game==="sevens"){if(sel.size!==1)return toast("請選一張牌");socket.emit("sevenAction",{code,id:[...sel][0],cover:false})}else socket.emit("playCards",{code,ids:[...sel]})};
$("#coverBtn").onclick=()=>{if(sel.size!==1)return toast("請選一張要蓋掉的牌");socket.emit("sevenAction",{code,id:[...sel][0],cover:true})};
$("#passBtn").onclick=()=>socket.emit("pass",{code});
$("#specialBtn").onclick=()=>{
 if(!state)return;
 if(state.game==="chinese"){socket.emit("submitChinese",{code});return}
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
$("#mjWinBtn").onclick=()=>socket.emit("mahjongWin",{code});
$("#mjPongBtn").onclick=()=>socket.emit("mahjongClaim",{code,type:"pong"});
$("#mjKongBtn").onclick=()=>{const o=priv.mahjongOptions||{};if(state.mahjongReaction)socket.emit("mahjongClaim",{code,type:"kong"});else if(o.concealedKongs?.length)socket.emit("mahjongConcealedKong",{code,id:o.concealedKongs[0]})};
$("#mjChowBtn").onclick=()=>{const cs=priv.mahjongOptions?.chows||[];if(!cs.length)return;let pick=cs[0];if(cs.length>1){const msg=cs.map((x,i)=>`${i+1}. ${x.join(" ")}`).join("\n");const n=+prompt("選擇吃法：\n"+msg,"1");if(!n||!cs[n-1])return;pick=cs[n-1]}socket.emit("mahjongClaim",{code,type:"chow",ids:pick})};
$("#mjPassBtn").onclick=()=>socket.emit("mahjongPass",{code});
$("#rulesBtn").onclick=()=>alert(rule(state.game));
$("#leaveBtn").onclick=()=>{if(confirm("確定離開目前房間？")){socket.emit("leaveRoom",{code});sessionStorage.removeItem(tokenKey(code));sessionStorage.removeItem("cardhall_active");sessionStorage.removeItem("cardhall_room");sessionStorage.removeItem("cardhall_join_name");sessionStorage.removeItem("cardhall_pwd");setTimeout(()=>location.href="player.html",200)}};
socket.on("needPassword",()=>$("#pwdWrap").classList.remove("hidden"));
socket.on("errorMsg",toast);
socket.on("roomDeleted",()=>{alert("房間已被主控刪除");sessionStorage.removeItem(tokenKey(code));sessionStorage.removeItem("cardhall_active");sessionStorage.removeItem("cardhall_room");sessionStorage.removeItem("cardhall_join_name");sessionStorage.removeItem("cardhall_pwd");location.href="player.html"});
socket.on("joined",x=>{code=x.code;myPid=x.pid;sessionStorage.setItem(tokenKey(code),x.reconnectToken);localStorage.setItem(persistentTokenKey(code,sessionStorage.getItem("cardhall_join_name")||$("#name").value),x.reconnectToken);sessionStorage.setItem("cardhall_active","1");$("#roomCode").textContent=code;$("#joinWrap").classList.add("hidden");$("#gameWrap").classList.remove("hidden");toast(x.reconnected?"已回到原座位":"已加入房間")});
socket.on("privateState",p=>{priv=p;myPid=p.pid;if(sel.size&&![...sel].some(k=>p.hand?.some(c=>(c.uid||c.id)===k)))sel.clear();renderHand();renderButtons()});
let lastHistLen=0;
socket.on("roomState",s=>{if(state&&s.history.length>lastHistLen&&s.status==="playing")beep(s.game==="mahjong"?"tile":"card");lastHistLen=s.history.length;state=s;renderState()});
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
   o.type=kind==="tile"?"square":"triangle";
   const f=kind==="countFinal"?760:kind==="count"?520:kind==="tile"?430:340;
   const dur=kind==="countFinal"?.13:kind==="count"?.075:kind==="tile"?.055:.06;
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
 if(!soundOn||e?.game!=="mahjong")return;
 if(e.action==="discard"){beep("tile");setTimeout(()=>speak(MJ_NAMES[e.tileId]||e.tileId),45)}
 else if(e.action==="chow"){beep("tile");speak("吃")}
 else if(e.action==="pong"){beep("tile");speak("碰")}
 else if(e.action==="kong"){beep("tile");speak("槓")}
 else if(e.action==="win"){beep("countFinal");speak("胡")}
});
function renderState(){
 document.body.classList.toggle("game-mahjong",state.game==="mahjong");
 $("#gameName").textContent=state.gameName;$("#online").textContent=`${state.connectedCount}/${state.needPlayers}`;$("#round").textContent=`${state.round}/${state.totalRounds}`;
 $("#seats").innerHTML=Array.from({length:state.needPlayers},(_,i)=>state.players[i]?`<div class="pseat ${i===state.currentTurn?"turn":""} ${state.players[i].connected?"":"off"}">👤 ${esc(state.players[i].name)}<br><span class="statusdot">${state.players[i].connected?"🟢":"⚪ 斷線保留"}｜🏆 ${state.players[i].wins} 勝${state.status==="playing"?"｜剩 "+state.players[i].count:""}${state.players[i].covered?`｜蓋 ${state.players[i].covered}`:""}</span>${state.game==="mahjong"&&state.players[i].melds?.length?`<div class="meldMini">${state.players[i].melds.map(m=>m.tiles.map(t=>`<img src="tiles/${t.id}.svg">`).join("")).join("")}</div>`:""}</div>`:`<div class="pseat off">等待玩家</div>`).join("");
 $("#history").innerHTML=[...state.history].reverse().map(x=>`<div class="hist">${esc(x.text)}</div>`).join("");
 if(state.status==="waiting")$("#turnText").textContent=`等待玩家（${state.connectedCount}/${state.needPlayers}）`;else if(state.status==="countdown")$("#turnText").textContent="準備開始";else if(state.status==="playing"){if(state.game==="chinese")$("#turnText").textContent="請完成本回合排牌";else{const p=state.players[state.currentTurn];$("#turnText").textContent=p?(p.pid===myPid?"⬇ 輪到你":"輪到："+p.name):""}}else $("#turnText").textContent="本回合結束";
 $("#countdown").classList.toggle("hidden",state.status!=="countdown");renderBoard();renderButtons();renderResult();startTicker();
}
function renderButtons(){
 $("#coverBtn").classList.toggle("hidden",state.game!=="sevens");$("#passBtn").classList.toggle("hidden",!["big2","landlord"].includes(state.game));$("#playBtn").classList.toggle("hidden",["chinese","mahjong"].includes(state.game));
 const sp=$("#specialBtn");sp.classList.toggle("hidden",!["chinese","mahjong"].includes(state.game));sp.textContent=state.game==="chinese"?"一鍵自動排牌並提交":state.game==="mahjong"?"打出選取牌":"";
 const o=priv.mahjongOptions||{},mj=state.game==="mahjong";
 if(mj){
   const myTurn=state.status==="playing"&&!state.mahjongReaction&&state.players?.[state.currentTurn]?.pid===myPid;
   sp.disabled=!myTurn||sel.size!==1;
   sp.title=myTurn?(sel.size===1?"打出目前選取的牌":"先點一張牌"):"還沒輪到你";
 }else sp.disabled=false;
 const mb=[["#mjWinBtn",!!(o.selfWin||o.win)],["#mjPongBtn",!!o.pong],["#mjKongBtn",!!(o.kong||(o.concealedKongs||[]).length)],["#mjChowBtn",!!(o.chows||[]).length],["#mjPassBtn",!!o.canPass]];
 mb.forEach(([q,on])=>{const b=$(q);b.classList.toggle("hidden",!mj);b.disabled=!on;b.classList.toggle("mjReady",!!on)});

}
function renderBoard(){
 const b=$("#board");
 if(["big2","landlord"].includes(state.game)){
   const bottom=state.game==="landlord"&&state.board?.bottomCards?.length?`<div class="ddzBottom"><b>地主底牌</b>${state.board.bottomCards.map(c=>`<img class="cardOut mini" src="cards/${c.id}.svg">`).join("")}</div>`:"";
   const play=state.lastPlay?state.lastPlay.cards.map(c=>`<img class="cardOut" src="cards/${c.id}.svg">`).join(""):"桌面尚無牌";
   b.innerHTML=bottom+`<div>${play}</div>`;
 }
 else if(state.game==="sevens"){let h="";for(const s of ["C","D","H","S"]){const a=state.board?.[s]||[];h+=`<div style="width:100%;display:flex;justify-content:center;align-items:center;gap:1px"><b style="width:20px">${s}</b>${a.map(c=>`<img class="cardOut" src="cards/${c.id}.svg">`).join("")}</div>`}b.innerHTML=h}
 else if(state.game==="mahjong")b.innerHTML=`${state.mahjongReaction?`<div class="reactionText">等待 吃／碰／槓／胡／過　${Math.max(0,Math.ceil((state.mahjongReaction.endsAt-Date.now())/1000))} 秒</div>`:""}<div class="discardGrid">${(state.board?.discards||[]).slice(-36).map(x=>`<img src="tiles/${x.tile.id}.svg">`).join("")}</div>`;
 else b.innerHTML="十三支：完成排牌後等待其他玩家";
}
function renderHand(){
 const h=priv.hand||[],el=$("#hand");
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
   el.innerHTML=h.map(c=>`<img class="card ${sel.has(c.id)?"sel":""}" data-id="${c.id}" src="cards/${c.id}.svg">`).join("");
   el.querySelectorAll(".card").forEach(x=>x.onclick=()=>{const id=x.dataset.id;sel.has(id)?sel.delete(id):sel.add(id);renderHand()})
 }
}
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
   if(state.status==="playing"&&state.turnEndsAt){
     const n=Math.max(0,Math.ceil((state.turnEndsAt-Date.now())/1000));
     $("#timer").textContent="⏱️ "+n;
     if(state.players?.[state.currentTurn]?.pid===myPid&&n>0&&n<=3&&n!==lastTurnSecond){lastTurnSecond=n;beep("countFinal")}
   }else{$("#timer").textContent="";lastTurnSecond=null}
 },120)
}
function rule(g){if(g==="big2")return "大老二：3 最小、2 最大；花色 ♣<♦<♥<♠；持有 ♣3 者先出，第一手需含 ♣3。五張牌型：順子＜同花＜葫蘆＜鐵支＜同花順。可 PASS 時超時會自動 PASS；領出者超時會由系統出最小合法牌。";if(g==="sevens")return "牌七：持有 ♠7 者先出。每個花色從 7 往上或往下接；如果手上沒有任何合法牌，必須選一張蓋牌。手牌清空即獲勝。";if(g==="chinese")return "十三支：13 張分成前3、中5、後5。本版先用一鍵自動排牌完成多人流程。";if(g==="landlord")return "鬥地主公開測試：54 張（52 張＋小王＋大王）；3 人各 17 張，系統隨機地主後取得 3 張底牌。支援單張、對子、三條、三帶一、三帶二、順子、連對、無翅膀飛機、炸彈、王炸。2 與大小王不能放進順子／連對／飛機。";return "麻將：台灣 16 張。每人平常 16 張，摸牌後 17 張再打一張。支援吃、碰、明槓、暗槓、自摸、別人打出的牌胡牌與過；吃只能吃上家打出的牌。吃碰槓後會顯示在副露區。胡牌基本結構為五組面子＋一對將。"}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
