
const express=require("express");
const http=require("http");
const path=require("path");
const crypto=require("crypto");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{pingTimeout:20000,pingInterval:10000});
app.use(express.json());
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"1234";
function adminTokenSign(exp){const body=String(exp);const sig=crypto.createHmac("sha256",ADMIN_PASSWORD).update(body).digest("hex");return `${body}.${sig}`}
function validAdminToken(token){const [body,sig]=String(token||"").split(".");if(!body||!sig||!/^\d+$/.test(body)||+body<Date.now())return false;const want=crypto.createHmac("sha256",ADMIN_PASSWORD).update(body).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(sig,"hex"),Buffer.from(want,"hex"))}catch{return false}}
app.post("/api/admin-login",(req,res)=>{if(String(req.body?.password||"")!==ADMIN_PASSWORD)return res.status(401).json({ok:false});res.json({ok:true,token:adminTokenSign(Date.now()+12*60*60*1000)})});
app.post("/api/admin-session",(req,res)=>res.json({ok:validAdminToken(req.body?.token)}));
app.use(express.static(path.join(__dirname,"public")));
app.get("/health",(req,res)=>res.json({ok:true,rooms:rooms.size,version:"2.0.6"}));

const PORT=process.env.PORT||3000;
const rooms=new Map();
const roomArchives=new Map();

const GAME_META={
  big2:{name:"大老二",players:4},
  sevens:{name:"接龍",players:4},
  chinese:{name:"十三支",players:4},
  landlord:{name:"鬥地主",players:3},
  mahjong:{name:"麻將",players:4},
};

const RANKS=["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
const SUITS=["C","D","H","S"];
const suitWeight={C:0,D:1,H:2,S:3};

function uid(){return crypto.randomBytes(12).toString("hex")}
function roomCode(){let c;do c=String(Math.floor(100000+Math.random()*900000));while(rooms.has(c));return c}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function deck52(){
 const d=[];for(let r=0;r<RANKS.length;r++)for(let s=0;s<SUITS.length;s++)d.push({id:RANKS[r]+SUITS[s],rank:RANKS[r],suit:SUITS[s],rv:r,sv:s});
 return d;
}
function deck54(){
 const d=deck52();
 d.push({id:"SJ",rank:"小王",suit:"J",rv:13,sv:0,joker:true});
 d.push({id:"BJ",rank:"大王",suit:"J",rv:14,sv:1,joker:true});
 return d;
}
function sortCards(a){return a.sort((x,y)=>x.rv-y.rv||x.sv-y.sv)}
function pname(r,pid){return r.players.find(p=>p.pid===pid)?.name||"玩家"}
function hist(r,text){r.history.push({t:Date.now(),text});if(r.history.length>40)r.history.shift()}
function clearTimer(r,k){if(r[k])clearTimeout(r[k]);r[k]=null}
function clearAllTimers(r){["startTimer","turnTimer","nextTimer","aiFillTimer"].forEach(k=>clearTimer(r,k));r.aiFillDeadline=null}
function countConnected(r){return r.players.filter(p=>p.connected||p.isBot).length}
function archiveRoom(r){const a=roomArchives.get(r.code)||{code:r.code,game:r.game,gameName:GAME_META[r.game]?.name||r.game,createdAt:r.createdAt||Date.now(),lastActiveAt:Date.now(),players:[],rounds:0,results:[],ownerToken:r.ownerToken,status:r.status};a.lastActiveAt=Date.now();a.status=r.status;a.players=[...new Set([...(a.players||[]),...r.players.map(p=>p.name)])];a.rounds=Math.max(a.rounds||0,r.round||0);a.results=[...(r.matchResults||[])];roomArchives.set(r.code,a)}
function emitArchives(owner){if(!owner)return;io.to("admin:"+owner).emit("roomArchives",[...roomArchives.values()].filter(a=>a.ownerToken===owner).sort((a,b)=>b.createdAt-a.createdAt))}

function publicRoom(r){
 return {
  code:r.code, game:r.game, gameName:GAME_META[r.game].name, needPlayers:GAME_META[r.game].players,
  status:r.status, passwordRequired:!!r.password, autoStart:r.autoStart, startCountdown:r.startCountdown, big2Mode:r.big2Mode||"classic", aiMode:r.aiMode||"none", aiWaitSeconds:r.aiWaitSeconds||60, aiFillDeadline:r.aiFillDeadline||null,
  turnSeconds:r.turnSeconds, betweenSeconds:r.betweenSeconds, totalRounds:r.totalRounds, continuous:r.continuous,
  round:r.round, currentTurn:r.currentTurn, turnEndsAt:r.turnEndsAt||null, countdownEndsAt:r.countdownEndsAt||null,
  lastPlay:r.lastPlay?{playerPid:r.lastPlay.playerPid,cards:r.lastPlay.cards,type:r.lastPlay.type}:null,
  board:r.board||null, history:r.history.slice(-12), matchResults:r.matchResults||[], winner:r.winner||null, ranking:r.ranking||null, testNote:r.testNote||"",
  mahjongReaction:r.mahjongReaction?{discarderPid:r.mahjongReaction.discarderPid,tile:r.mahjongReaction.tile,endsAt:r.mahjongReaction.endsAt}:null,
  connectedCount:countConnected(r),
  players:r.players.map(p=>({pid:p.pid,name:p.name,count:p.hand?.length||0,wins:p.wins||0,role:p.role||null,connected:p.connected,covered:p.covered?.length||0,submitted:!!p.submitted,melds:p.melds||[],isBot:!!p.isBot}))
 };
}
function emitAdmins(ownerToken){
 if(!ownerToken)return;
 io.to("admin:"+ownerToken).emit("roomsList",[...rooms.values()].filter(r=>r.ownerToken===ownerToken).map(publicRoom));
}
function emitRoom(r){
 io.to("room:"+r.code).emit("roomState",publicRoom(r));
 for(const p of r.players){
  if(p.socketId) io.to(p.socketId).emit("privateState",{pid:p.pid,hand:p.hand||[],role:p.role||null,submitted:!!p.submitted,melds:p.melds||[],drawnUid:p.drawnUid||null,mahjongOptions:mahjongOptionsFor(r,p),chineseRecommendations:(r.game==="chinese"&&r.status==="playing"&&!p.submitted)?(p.chineseRecommendations||(p.chineseRecommendations=chineseRecommend(p.hand))):[]});
 }
 archiveRoom(r);emitAdmins(r.ownerToken);
}
function createRoom(o={}){
 const game=GAME_META[o.game]?o.game:"big2", code=roomCode();
 const r={
  code,game,createdAt:Date.now(),ownerToken:String(o.ownerToken||""),password:String(o.password||"").slice(0,16),autoStart:o.autoStart!==false,
  startCountdown:Math.max(3,Math.min(20,+o.startCountdown||5)),
  turnSeconds:0,
  betweenSeconds:Math.max(3,Math.min(30,+o.betweenSeconds||8)),
  totalRounds:Math.max(1,Math.min(20,+o.totalRounds||4)),
  continuous:!!o.continuous,status:"waiting",round:0,currentTurn:null,
  big2Mode:game==="big2"?(o.big2Mode==="traditional"?"traditional":"classic"):null,
  aiMode:game==="mahjong"?"none":(["manual","auto"].includes(o.aiMode)?o.aiMode:"none"),aiWaitSeconds:Math.max(10,Math.min(600,+o.aiWaitSeconds||60)),aiFillTimer:null,aiFillDeadline:null,
  players:[],history:[],matchResults:[],board:null,lastPlay:null,passCount:0,firstPlay:true,
  winner:null,ranking:null,countdownEndsAt:null,turnEndsAt:null,wall:[],
  startTimer:null,turnTimer:null,nextTimer:null,reactionTimer:null,mahjongReaction:null,testNote:""
 };

 if(game==="landlord")r.testNote="鬥地主公開測試：54 張（含大小王）、3 人各 17 張＋地主 3 張底牌；支援王炸、炸彈、順子、連對、三帶一／二、無翅膀飛機。地主目前由系統隨機。";
 if(game==="mahjong")r.testNote="麻將：台灣 16 張；支援吃、碰、明槓、暗槓、自摸、放槍胡、過與副露區。";
 rooms.set(code,r);archiveRoom(r);return r;
}

function resetRoundState(r){
 clearAllTimers(r);r.board=null;r.lastPlay=null;r.passCount=0;r.firstPlay=true;r.winner=null;r.ranking=null;
 r.countdownEndsAt=null;r.turnEndsAt=null;r.currentTurn=null;
 r.mahjongReaction=null;clearTimer(r,"reactionTimer");
 r.players.forEach(p=>{p.hand=[];p.covered=[];p.role=null;p.submitted=false;p.chinese=null;p.melds=[];p.drawnUid=null});
}
function maybeStart(r){
 const need=GAME_META[r.game].players;
 if(r.status!=="waiting"||!r.autoStart||r.players.length!==need||countConnected(r)!==need||r.startTimer)return;
 r.status="countdown";r.countdownEndsAt=Date.now()+r.startCountdown*1000;hist(r,`人數已滿，${r.startCountdown} 秒後開始`);
 emitRoom(r);
 r.startTimer=setTimeout(()=>{r.startTimer=null;if(r.players.length===need&&countConnected(r)===need)startRound(r);else{r.status="waiting";r.countdownEndsAt=null;emitRoom(r)}},r.startCountdown*1000);
}
function manualStart(r){
 const need=GAME_META[r.game].players;
 if(!["waiting","countdown"].includes(r.status))return {ok:false,msg:"遊戲已經開始"};
 if(r.players.length!==need||countConnected(r)!==need)return {ok:false,msg:`需 ${need} 位玩家全部在線才能開始`};
 clearTimer(r,"startTimer");
 r.status="countdown";r.countdownEndsAt=Date.now()+r.startCountdown*1000;hist(r,`主控開始遊戲，${r.startCountdown} 秒後開始`);emitRoom(r);
 r.startTimer=setTimeout(()=>{r.startTimer=null;if(r.players.length===need&&countConnected(r)===need)startRound(r);else{r.status="waiting";r.countdownEndsAt=null;emitRoom(r)}},r.startCountdown*1000);
 return {ok:true};
}
function scheduleTurn(r){
 clearTimer(r,"turnTimer");r.turnEndsAt=null;emitRoom(r);
 if(r.status==="playing"&&r.game!=="mahjong")setTimeout(()=>maybeBotMove(r),500+Math.floor(Math.random()*500));
}
function finishRound(r,p){
 clearTimer(r,"turnTimer");r.turnEndsAt=null;p.wins=(p.wins||0)+1;r.winner={pid:p.pid,name:p.name};r.status="round_end";
 r.matchResults=r.matchResults||[];r.matchResults.push({round:r.round,winner:p.name,at:Date.now(),players:r.players.map(x=>({name:x.name,wins:x.wins||0,covered:(x.covered||[]).length}))});
 hist(r,`🏆 第 ${r.round} 回合：${p.name} 獲勝`);
 io.to("room:"+r.code).emit("gameSound",{game:r.game,action:"win",playerName:p.name});
 const sorted=[...r.players].sort((a,b)=>(b.wins||0)-(a.wins||0)||a.name.localeCompare(b.name,"zh-Hant"));
 let rank=0,last=null; r.ranking=sorted.map((x,i)=>{if(last===null||x.wins!==last)rank=i+1;last=x.wins;return{rank,name:x.name,wins:x.wins}});
 emitRoom(r);
 if(r.round>=r.totalRounds){
  r.status="finished";emitRoom(r);
  if(r.continuous)r.nextTimer=setTimeout(()=>{r.players.forEach(x=>x.wins=0);r.round=0;r.status="waiting";r.winner=null;r.ranking=null;hist(r,"新一場開始等待");emitRoom(r);maybeStart(r)},r.betweenSeconds*1000);
 }else r.nextTimer=setTimeout(()=>startRound(r),r.betweenSeconds*1000);
}
function startRound(r){
 resetRoundState(r);r.round++;r.status="playing";hist(r,`第 ${r.round}/${r.totalRounds} 回合開始`);
 if(r.game==="big2")setupBig2(r);
 else if(r.game==="sevens")setupSevens(r);
 else if(r.game==="chinese")setupChinese(r);
 else if(r.game==="landlord")setupLandlord(r);
 else setupMahjong(r);
 emitRoom(r);setTimeout(()=>maybeBotMove(r),650);
}

function setupBig2(r){
 const d=shuffle(deck52());for(let i=0;i<52;i++)r.players[i%4].hand.push(d[i]);r.players.forEach(p=>sortCards(p.hand));
 r.currentTurn=r.players.findIndex(p=>p.hand.some(c=>c.id==="3C"));r.firstPlay=true;r.lastPlay=null;r.passCount=0;scheduleTurn(r);
}
function evalBig2(cards,mode="classic"){
 const c=sortCards([...cards]),n=c.length,key=x=>x.rv*4+x.sv;
 if(n===1)return{type:"單張",grp:1,str:[key(c[0])]};
 if(n===2&&c[0].rv===c[1].rv)return{type:"對子",grp:2,str:[c[0].rv,Math.max(c[0].sv,c[1].sv)]};
 if(n===3&&mode==="traditional"&&c.every(x=>x.rv===c[0].rv))return{type:"三條",grp:3,str:[c[0].rv,Math.max(...c.map(x=>x.sv))]};
 if(n!==5)return null;
 const cnt={};c.forEach(x=>cnt[x.rank]=(cnt[x.rank]||0)+1);const groups=Object.entries(cnt).map(([rank,k])=>({rank,k,rv:RANKS.indexOf(rank)}));
 const o={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13};
 const raw=[...new Set(c.map(x=>x.rank))].sort((x,y)=>o[x]-o[y]).join(",");
 const sm={"A,2,3,4,5":0,"3,4,5,6,7":1,"4,5,6,7,8":2,"5,6,7,8,9":3,"6,7,8,9,10":4,"7,8,9,10,J":5,"8,9,10,J,Q":6,"9,10,J,Q,K":7,"10,J,Q,K,A":8,"2,3,4,5,6":9};
 const sr=sm[raw],straight=sr!==undefined,flush=c.every(x=>x.sv===c[0].sv);
 if(straight&&flush)return{type:"同花順",grp:5,str:[sr,Math.max(...c.map(x=>x.sv))]};
 if(groups.some(g=>g.k===4))return{type:"鐵支",grp:5,str:[groups.find(g=>g.k===4).rv]};
 if(groups.length===2&&groups.some(g=>g.k===3)&&groups.some(g=>g.k===2))return{type:"葫蘆",grp:5,str:[groups.find(g=>g.k===3).rv]};
 if(flush)return{type:"同花",grp:5,str:[...c].sort((a,b)=>key(b)-key(a)).map(key)};
 if(straight)return{type:"順子",grp:5,str:[sr,Math.max(...c.map(x=>x.sv))]};
 return null;
}
function cmp(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]??0,y=b[i]??0;if(x>y)return 1;if(x<y)return-1}return 0}
function playBig2(r,p,ids,auto=false){
 const idx=r.players.indexOf(p);if(idx!==r.currentTurn)return false;
 const cards=ids.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean);if(cards.length!==ids.length||!cards.length)return false;
 const ev=evalBig2(cards,r.big2Mode);if(!ev)return false;if(r.firstPlay&&!cards.some(c=>c.id==="3C"))return false;
 if(r.lastPlay){const le=evalBig2(r.lastPlay.cards,r.big2Mode);if(!le)return false;
  const special=x=>x.type==="鐵支"?1:x.type==="同花順"?2:0;
  if(ev.grp!==le.grp)return false;
  if(ev.grp===5){const es=special(ev),ls=special(le);if(es||ls){if(es<ls)return false;if(es===ls&&ev.type!==le.type)return false;if(es===ls&&cmp(ev.str,le.str)<=0)return false}else if(ev.type!==le.type||cmp(ev.str,le.str)<=0)return false}
  else if(ev.type!==le.type||cmp(ev.str,le.str)<=0)return false
 }
 const set=new Set(ids);p.hand=p.hand.filter(c=>!set.has(c.id));r.lastPlay={playerPid:p.pid,cards,type:ev.type};r.passCount=0;r.firstPlay=false;
 hist(r,`${p.name}${auto?"（系統）":""} 出牌：${ev.type}`);io.to("room:"+r.code).emit("gameSound",{game:"big2",action:"play",playerName:p.name,type:ev.type,cards:cards.map(c=>({id:c.id,rank:c.rank,suit:c.suit}))});
 if(p.hand.length===0)return finishRound(r,p),true;
 r.currentTurn=(idx+1)%4;scheduleTurn(r);return true;
}
function passBig2(r,p,auto=false){
 const idx=r.players.indexOf(p);if(idx!==r.currentTurn||!r.lastPlay)return false;hist(r,`${p.name}${auto?"（超時）":""} PASS`);io.to("room:"+r.code).emit("gameSound",{game:"big2",action:"pass",playerName:p.name});r.passCount++;
 if(r.passCount>=3){r.currentTurn=r.players.findIndex(x=>x.pid===r.lastPlay.playerPid);r.lastPlay=null;r.passCount=0}
 else r.currentTurn=(idx+1)%4;scheduleTurn(r);return true;
}

function setupSevens(r){
 const d=shuffle(deck52());for(let i=0;i<52;i++)r.players[i%4].hand.push(d[i]);r.players.forEach(p=>sortCards(p.hand));
 r.board={C:[],D:[],H:[],S:[]};r.currentTurn=r.players.findIndex(p=>p.hand.some(c=>c.id==="7S"));scheduleTurn(r);
}
function sevenLegal(r,c){
 const arr=r.board[c.suit],o={A:1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13},v=o[c.rank];
 if(!arr.length)return c.rank==="7";const vals=arr.map(x=>o[x.rank]),mi=Math.min(...vals),ma=Math.max(...vals);return v===mi-1||v===ma+1;
}
function playSeven(r,p,id,cover=false,auto=false){
 const idx=r.players.indexOf(p);if(idx!==r.currentTurn)return false;const c=p.hand.find(x=>x.id===id);if(!c)return false;
 const hasLegal=p.hand.some(x=>sevenLegal(r,x));
 if(cover){
  if(hasLegal)return false;p.hand=p.hand.filter(x=>x.id!==id);p.covered.push(c);hist(r,`${p.name}${auto?"（系統）":""} 蓋牌 1 張`);io.to("room:"+r.code).emit("gameSound",{game:"sevens",action:"cover",playerName:p.name});
 }else{
  if(!sevenLegal(r,c))return false;p.hand=p.hand.filter(x=>x.id!==id);r.board[c.suit].push(c);r.board[c.suit].sort((a,b)=>a.rv-b.rv);hist(r,`${p.name}${auto?"（系統）":""} 出 ${c.id}`);io.to("room:"+r.code).emit("gameSound",{game:"sevens",action:"play",playerName:p.name,card:{id:c.id,rank:c.rank,suit:c.suit}});
 }
 if(r.players.every(x=>x.hand.length===0)){const winner=[...r.players].sort((a,b)=>(a.covered?.length||0)-(b.covered?.length||0))[0];return finishRound(r,winner),true}
 let ni=(idx+1)%4,g=0;while(r.players[ni].hand.length===0&&g++<4)ni=(ni+1)%4;r.currentTurn=ni;scheduleTurn(r);return true;
}

function setupChinese(r){
 const d=shuffle(deck52());for(let i=0;i<52;i++)r.players[i%4].hand.push(d[i]);r.players.forEach(p=>sortCards(p.hand));
 r.players.forEach(p=>p.chineseRecommendations=null);r.currentTurn=null;r.turnEndsAt=null;clearTimer(r,"turnTimer");emitRoom(r);
}
function autoArrange(h){const x=[...h].sort((a,b)=>a.rv-b.rv||a.sv-b.sv);return{front:x.slice(0,3),middle:x.slice(3,8),back:x.slice(8)}}
function comb(a,k,start=0,p=[],out=[]){if(p.length===k){out.push([...p]);return out}for(let i=start;i<=a.length-(k-p.length);i++){p.push(a[i]);comb(a,k,i+1,p,out);p.pop()}return out}
function chineseValid(x){if(!x||x.front?.length!==3||x.middle?.length!==5||x.back?.length!==5)return false;return cmp(handScore5(x.back),handScore5(x.middle))>=0&&cmp(handScore5(x.middle),score3(x.front))>=0}
function chineseRecommend(h){
 const fronts=comb([...h],3),best=[];
 for(const f of fronts){const fs=new Set(f.map(c=>c.id)),rem=h.filter(c=>!fs.has(c.id));for(const m of comb(rem,5)){const ms=new Set(m.map(c=>c.id)),b=rem.filter(c=>!ms.has(c.id));const x={front:f,middle:m,back:b};if(!chineseValid(x))continue;const sc=[...handScore5(b),...handScore5(m),...score3(f)];best.push({x,sc})}}
 best.sort((a,b)=>-cmp(a.sc,b.sc));return best.slice(0,3).map(z=>z.x);
}
function chineseType(cs){const q=cs.length===3?score3(cs):handScore5(cs),n=q[0];return cs.length===3?({0:"高牌",1:"一對",3:"三條"}[n]||"高牌"):({0:"高牌",1:"一對",2:"兩對",3:"三條",4:"順子",5:"同花",6:"葫蘆",7:"鐵支",8:"同花順"}[n]||"牌型")}

function handScore5(cs){
 const v=cs.map(c=>c.rv).sort((a,b)=>a-b),cnt={};v.forEach(x=>cnt[x]=(cnt[x]||0)+1);const g=Object.entries(cnt).map(([x,k])=>({x:+x,k})).sort((a,b)=>b.k-a.k||b.x-a.x);
 const flush=cs.every(c=>c.suit===cs[0].suit),u=[...new Set(v)],st=u.length===5&&u[4]-u[0]===4;
 if(st&&flush)return[8,u[4]];if(g[0].k===4)return[7,g[0].x];if(g[0].k===3&&g[1]?.k===2)return[6,g[0].x];
 if(flush)return[5,...[...v].reverse()];if(st)return[4,u[4]];if(g[0].k===3)return[3,g[0].x];if(g[0].k===2&&g[1]?.k===2)return[2,g[0].x,g[1].x];if(g[0].k===2)return[1,g[0].x];return[0,...[...v].reverse()];
}
function score3(cs){const v=cs.map(c=>c.rv),cnt={};v.forEach(x=>cnt[x]=(cnt[x]||0)+1);const g=Object.entries(cnt).map(([x,k])=>({x:+x,k})).sort((a,b)=>b.k-a.k||b.x-a.x);if(g[0].k===3)return[3,g[0].x];if(g[0].k===2)return[1,g[0].x];return[0,...v.sort((a,b)=>b-a)]}
function resolveChinese(r){
 clearTimer(r,"turnTimer");r.turnEndsAt=null;const scores=new Map(r.players.map(p=>[p.pid,0]));
 for(let i=0;i<r.players.length;i++)for(let j=i+1;j<r.players.length;j++){const a=r.players[i],b=r.players[j],aa=[score3(a.chinese.front),handScore5(a.chinese.middle),handScore5(a.chinese.back)],bb=[score3(b.chinese.front),handScore5(b.chinese.middle),handScore5(b.chinese.back)];for(let k=0;k<3;k++){const c=cmp(aa[k],bb[k]);if(c>0)scores.set(a.pid,scores.get(a.pid)+1);else if(c<0)scores.set(b.pid,scores.get(b.pid)+1)}}
 const w=[...r.players].sort((a,b)=>scores.get(b.pid)-scores.get(a.pid))[0];hist(r,"十三支完成比牌");finishRound(r,w);
}

function setupLandlord(r){
 const d=shuffle(deck54());
 for(let i=0;i<51;i++)r.players[i%3].hand.push(d[i]);
 const bottom=d.slice(51),land=Math.floor(Math.random()*3);
 r.players.forEach((p,i)=>{p.role=i===land?"地主":"農民"});
 r.players[land].hand.push(...bottom);
 r.players.forEach(p=>sortCards(p.hand));
 r.board={bottomCards:bottom,landlordPid:r.players[land].pid};
 r.currentTurn=land;r.lastPlay=null;r.passCount=0;scheduleTurn(r);
}
function ddzEval(cs){
 const c=[...cs].sort((a,b)=>a.rv-b.rv),n=c.length,vals=c.map(x=>x.rv);
 const cnt={};vals.forEach(v=>cnt[v]=(cnt[v]||0)+1);
 const groups=Object.entries(cnt).map(([v,k])=>({v:+v,k})).sort((a,b)=>a.v-b.v);
 if(n===2&&c.some(x=>x.id==="SJ")&&c.some(x=>x.id==="BJ"))return{type:"王炸",str:[99]};
 if(n===1)return{type:"單張",str:[1,c[0].rv]};
 if(n===2&&groups.length===1&&groups[0].k===2)return{type:"對子",str:[2,groups[0].v]};
 if(n===3&&groups.length===1&&groups[0].k===3)return{type:"三條",str:[3,groups[0].v]};
 if(n===4&&groups.length===1&&groups[0].k===4)return{type:"炸彈",str:[90,groups[0].v]};
 if(n===4&&groups.some(g=>g.k===3))return{type:"三帶一",str:[4,groups.find(g=>g.k===3).v]};
 if(n===5&&groups.some(g=>g.k===3)&&groups.some(g=>g.k===2))return{type:"三帶二",str:[5,groups.find(g=>g.k===3).v]};
 const uniq=[...new Set(vals)];
 if(n>=5&&uniq.length===n&&uniq[n-1]<=11&&uniq[n-1]-uniq[0]===n-1)return{type:"順子",str:[6,n,uniq[n-1]]};
 if(n>=6&&n%2===0&&groups.every(g=>g.k===2)&&groups[groups.length-1].v<=11&&groups.every((g,i)=>i===0||g.v===groups[i-1].v+1))
   return{type:"連對",str:[7,n,groups[groups.length-1].v]};
 if(n>=6&&n%3===0&&groups.every(g=>g.k===3)&&groups[groups.length-1].v<=11&&groups.every((g,i)=>i===0||g.v===groups[i-1].v+1))
   return{type:"飛機",str:[8,n,groups[groups.length-1].v]};
 return null;
}
function ddzBeat(e,last){
 if(!last)return true;
 if(e.type==="王炸")return last.type!=="王炸";
 if(last.type==="王炸")return false;
 if(e.type==="炸彈"&&last.type!=="炸彈")return true;
 if(e.type!==last.type)return false;
 if(["順子","連對","飛機"].includes(e.type)&&e.str[1]!==last.strength[1])return false;
 return cmp(e.str,last.strength)>0;
}
function playDDZ(r,p,ids,auto=false){
 const idx=r.players.indexOf(p);if(idx!==r.currentTurn)return false;const cs=ids.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean);if(cs.length!==ids.length||!cs.length)return false;const e=ddzEval(cs);if(!e||!ddzBeat(e,r.lastPlay))return false;
 const set=new Set(ids);p.hand=p.hand.filter(c=>!set.has(c.id));r.lastPlay={playerPid:p.pid,cards:cs,type:e.type,strength:e.str};r.passCount=0;hist(r,`${p.name}${auto?"（系統）":""} 出牌：${e.type}`);io.to("room:"+r.code).emit("gameSound",{game:"landlord",action:"play",playerName:p.name,type:e.type,cards:cs.map(c=>({id:c.id,rank:c.rank,suit:c.suit}))});
 if(!p.hand.length){finishRound(r,p);return true}r.currentTurn=(idx+1)%3;scheduleTurn(r);return true;
}
function passDDZ(r,p,auto=false){const idx=r.players.indexOf(p);if(idx!==r.currentTurn||!r.lastPlay)return false;hist(r,`${p.name}${auto?"（超時）":""} PASS`);io.to("room:"+r.code).emit("gameSound",{game:"landlord",action:"pass",playerName:p.name});r.passCount++;if(r.passCount>=2){r.currentTurn=r.players.findIndex(x=>x.pid===r.lastPlay.playerPid);r.lastPlay=null;r.passCount=0}else r.currentTurn=(idx+1)%3;scheduleTurn(r);return true}

function mahjongDeck(){
 const a=[];
 for(const ss of ["m","p","s"])for(let n=1;n<=9;n++)for(let k=0;k<4;k++){
   const id=`${n}${ss}`;a.push({id,uid:uid(),sort:(ss==="m"?0:ss==="p"?20:40)+n});
 }
 for(const [id,sort] of [["E",61],["S",62],["W",63],["N",64],["R",65],["G",66],["Wh",67]])for(let k=0;k<4;k++)a.push({id,uid:uid(),sort});
 return a;
}
function setupMahjong(r){
 r.wall=shuffle(mahjongDeck());
 for(let k=0;k<16;k++)for(let i=0;i<4;i++)r.players[i].hand.push(r.wall.pop());
 r.players.forEach(p=>{p.hand.sort((a,b)=>a.sort-b.sort);p.melds=[];p.drawnUid=null});
 r.board={discards:[],lastDiscard:null};r.mahjongReaction=null;r.currentTurn=0;
 if(r.wall.length){const t=r.wall.pop();r.players[0].hand.push(t);r.players[0].hand.sort((a,b)=>a.sort-b.sort);r.players[0].drawnUid=t.uid}
 scheduleTurn(r);
}
function mahjongBaseWin(h){
 if(h.length%3!==2)return false;
 const order=[];for(const s of ["m","p","s"])for(let n=1;n<=9;n++)order.push(`${n}${s}`);order.push("E","S","W","N","R","G","Wh");const cnt={};h.forEach(x=>cnt[x.id]=(cnt[x.id]||0)+1);
 function meld(c){const f=order.find(id=>(c[id]||0)>0);if(!f)return true;if(c[f]>=3){c[f]-=3;if(meld(c))return true;c[f]+=3}const m=f.match(/^([1-9])([mps])$/);if(m){const n=+m[1],ss=m[2],a=`${n+1}${ss}`,b=`${n+2}${ss}`;if(n<=7&&(c[a]||0)&&(c[b]||0)){c[f]--;c[a]--;c[b]--;if(meld(c))return true;c[f]++;c[a]++;c[b]++;}}return false}
 for(const id of order)if((cnt[id]||0)>=2){const c={...cnt};c[id]-=2;if(meld(c))return true}return false;
}
function mahjongWinPlayer(p,extra=null){
 const needConcealed=17-(p.melds?.length||0)*3;
 const h=[...p.hand];if(extra)h.push(extra);
 return h.length===needConcealed&&mahjongBaseWin(h);
}
function tileCounts(p,id){return p.hand.filter(x=>x.id===id).length}
function chowChoices(p,tile){
 const m=tile.id.match(/^([1-9])([mps])$/);if(!m)return[];
 const n=+m[1],ss=m[2],have=id=>p.hand.some(x=>x.id===id),out=[];
 for(const seq of [[n-2,n-1,n],[n-1,n,n+1],[n,n+1,n+2]]){
  if(seq[0]<1||seq[2]>9)continue;const ids=seq.map(x=>`${x}${ss}`),need=ids.filter(x=>x!==tile.id);
  if(need.every(have))out.push(ids);
 } return out;
}
function mahjongOptionsFor(r,p){
 if(r.game!=="mahjong"||r.status!=="playing")return{};
 const idx=r.players.indexOf(p),o={};
 if(!r.mahjongReaction){
  if(idx===r.currentTurn){
   o.selfWin=mahjongWinPlayer(p);
   o.concealedKongs=[...new Set(p.hand.map(x=>x.id))].filter(id=>tileCounts(p,id)===4);
  } return o;
 }
 if(p.pid===r.mahjongReaction.discarderPid)return{};
 if(r.mahjongReaction.claims?.[p.pid]||r.mahjongReaction.passes?.[p.pid])return{pending:true};
 const t=r.mahjongReaction.tile,di=r.players.findIndex(x=>x.pid===r.mahjongReaction.discarderPid);
 o.win=mahjongWinPlayer(p,t);o.pong=tileCounts(p,t.id)>=2;o.kong=tileCounts(p,t.id)>=3;
 o.chows=idx===(di+1)%4?chowChoices(p,t):[];
 o.canPass=o.win||o.pong||o.kong||o.chows.length>0;
 return o;
}
function removeTiles(p,ids){
 const removed=[];for(const id of ids){const pos=p.hand.findIndex(x=>x.id===id);if(pos<0)return null;removed.push(p.hand.splice(pos,1)[0])}return removed;
}
function removeClaimedDiscard(r,q){
 const a=r.board?.discards;if(!a?.length)return;
 const pos=a.findLastIndex? a.findLastIndex(x=>x.tile?.uid===q.tile?.uid) : (()=>{for(let i=a.length-1;i>=0;i--)if(a[i].tile?.uid===q.tile?.uid)return i;return -1})();
 if(pos>=0)a.splice(pos,1);
}
function reactionResponded(q,pid){return !!(q.claims?.[pid]||q.passes?.[pid])}
function maybeResolveMahjongReaction(r,claim=null){
 const q=r.mahjongReaction;if(!q)return;
 const eligible=q.eligiblePids||[];
 if(claim){
  const seat=pid=>r.players.findIndex(x=>x.pid===pid),di=seat(q.discarderPid),dist=pid=>(seat(pid)-di+4)%4,cd=dist(claim.pid);
  const blockers=eligible.filter(pid=>pid!==claim.pid&&!reactionResponded(q,pid)).some(pid=>{
    const a=q.eligibleActions?.[pid]||{},d=dist(pid);
    if(a.win)return true;
    if(claim.type==="chow")return !!(a.kong||a.pong);
    if(claim.type==="pong")return !!(a.kong||(a.pong&&d<cd));
    if(claim.type==="kong")return !!(a.kong&&d<cd);
    return false;
  });
  if(!blockers){resolveMahjongReaction(r);return}
 }
 if(eligible.length&&eligible.every(pid=>reactionResponded(q,pid)))resolveMahjongReaction(r);
}
function validateMahjongTiles(r){
 if(r.game!=="mahjong")return;
 const all=[];
 for(const p of r.players){all.push(...(p.hand||[]));for(const m of p.melds||[])all.push(...(m.tiles||[]))}
 all.push(...(r.wall||[]));all.push(...((r.board?.discards||[]).map(x=>x.tile)));
 const uidSeen=new Set(),counts={};let bad=false;
 for(const t of all){if(!t)continue;if(t.uid&&uidSeen.has(t.uid))bad=true;if(t.uid)uidSeen.add(t.uid);counts[t.id]=(counts[t.id]||0)+1}
 for(const [id,n] of Object.entries(counts))if(n>4)bad=true;
 if(bad)console.error("[Mahjong integrity] duplicate/over-4 tile detected",r.code,counts);
}
function drawTile(r,idx){
 if(!r.wall.length){clearTimer(r,"turnTimer");r.turnEndsAt=null;r.status="round_end";r.winner={pid:null,name:"流局"};hist(r,"牌牆已摸完，本回合流局");emitRoom(r);if(r.round>=r.totalRounds){r.status="finished";emitRoom(r)}else r.nextTimer=setTimeout(()=>startRound(r),r.betweenSeconds*1000);return}
 const t=r.wall.pop();r.players[idx].hand.push(t);r.players[idx].hand.sort((a,b)=>a.sort-b.sort);r.players[idx].drawnUid=t.uid;scheduleTurn(r);
}
function resolveMahjongReaction(r){
 const q=r.mahjongReaction;if(!q)return;clearTimer(r,"reactionTimer");
 const claims=Object.values(q.claims||{}),seat=pid=>r.players.findIndex(x=>x.pid===pid),di=seat(q.discarderPid);
 const dist=pid=>(seat(pid)-di+4)%4;
 const win=claims.filter(x=>x.type==="win").sort((a,b)=>dist(a.pid)-dist(b.pid))[0];
 const kp=claims.filter(x=>["kong","pong"].includes(x.type)).sort((a,b)=>(a.type==="kong"?0:1)-(b.type==="kong"?0:1)||dist(a.pid)-dist(b.pid))[0];
 const chow=claims.filter(x=>x.type==="chow").sort((a,b)=>dist(a.pid)-dist(b.pid))[0];
 const c=win||kp||chow;r.mahjongReaction=null;
 if(!c){r.currentTurn=(di+1)%4;drawTile(r,r.currentTurn);return}
 const p=r.players.find(x=>x.pid===c.pid),t=q.tile;p.drawnUid=null;
 if(c.type==="win"){hist(r,`🀄 ${p.name} 胡牌`);finishRound(r,p);return}
 removeClaimedDiscard(r,q);
 if(c.type==="pong"){const got=removeTiles(p,[t.id,t.id]);if(!got){r.currentTurn=(di+1)%4;drawTile(r,r.currentTurn);return}p.melds.push({type:"碰",tiles:[...got,t]});hist(r,`${p.name} 碰`);io.to("room:"+r.code).emit("gameSound",{game:"mahjong",action:"pong",playerName:p.name})}
 if(c.type==="kong"){const got=removeTiles(p,[t.id,t.id,t.id]);if(!got){r.currentTurn=(di+1)%4;drawTile(r,r.currentTurn);return}p.melds.push({type:"明槓",tiles:[...got,t]});hist(r,`${p.name} 明槓`);io.to("room:"+r.code).emit("gameSound",{game:"mahjong",action:"kong",playerName:p.name})}
 if(c.type==="chow"){const need=c.ids.filter(id=>id!==t.id);const got=removeTiles(p,need);if(!got){r.currentTurn=(di+1)%4;drawTile(r,r.currentTurn);return}const tiles=[...got,t].sort((a,b)=>a.sort-b.sort);p.melds.push({type:"吃",tiles});hist(r,`${p.name} 吃`);io.to("room:"+r.code).emit("gameSound",{game:"mahjong",action:"chow",playerName:p.name})}
 r.currentTurn=seat(p.pid);p.hand.sort((a,b)=>a.sort-b.sort);
 if(c.type==="kong"){if(r.wall.length){const kt=r.wall.pop();p.hand.push(kt);p.drawnUid=kt.uid}p.hand.sort((a,b)=>a.sort-b.sort)}
 validateMahjongTiles(r);scheduleTurn(r);
}
function discardMahjong(r,p,tileKey,auto=false){
 const idx=r.players.indexOf(p);if(idx!==r.currentTurn||r.mahjongReaction)return false;
 let realPos=p.hand.findIndex(x=>x.uid===tileKey);
 if(realPos<0)realPos=p.hand.findIndex(x=>x.id===tileKey);
 if(realPos<0)return false;
 const[t]=p.hand.splice(realPos,1);p.drawnUid=null;const disc={playerPid:p.pid,playerName:p.name,tile:t,at:Date.now()};r.board.discards.push(disc);r.board.lastDiscard=disc;hist(r,`${p.name}${auto?"（系統）":""} 打出一張牌`);io.to("room:"+r.code).emit("mahjongDiscarded",disc);io.to("room:"+r.code).emit("gameSound",{game:"mahjong",action:"discard",tileId:t.id,playerName:p.name});
 clearTimer(r,"turnTimer");r.turnEndsAt=null;
 const probe={...r,mahjongReaction:{discarderPid:p.pid,tile:t}},eligibleData=r.players.filter(x=>x.pid!==p.pid).map(x=>({p:x,o:mahjongOptionsFor(probe,x)})).filter(x=>Object.values(x.o).some(v=>Array.isArray(v)?v.length:!!v));
 const eligibleActions={};for(const x of eligibleData)eligibleActions[x.p.pid]={win:!!x.o.win,pong:!!x.o.pong,kong:!!x.o.kong,chow:!!x.o.chows?.length};
 r.mahjongReaction={discarderPid:p.pid,tile:t,claims:{},passes:{},eligiblePids:eligibleData.map(x=>x.p.pid),eligibleActions,endsAt:Date.now()+5000};
 if(!eligibleData.length){r.mahjongReaction=null;r.currentTurn=(idx+1)%4;drawTile(r,r.currentTurn);return true}
 r.reactionTimer=setTimeout(()=>resolveMahjongReaction(r),5000);emitRoom(r);return true;
}
function mahjongClaim(r,p,type,ids=[]){
 const q=r.mahjongReaction;if(!q||p.pid===q.discarderPid)return false;const o=mahjongOptionsFor(r,p);
 if(type==="win"&&!o.win)return false;if(type==="pong"&&!o.pong)return false;if(type==="kong"&&!o.kong)return false;
 if(type==="chow"&&!o.chows.some(a=>JSON.stringify(a)===JSON.stringify(ids)))return false;
 q.claims[p.pid]={pid:p.pid,type,ids};delete q.passes[p.pid];emitRoom(r);
 if(type==="win")resolveMahjongReaction(r);else maybeResolveMahjongReaction(r,q.claims[p.pid]);return true;
}
function mahjongPass(r,p){const q=r.mahjongReaction;if(!q||!(q.eligiblePids||[]).includes(p.pid))return false;q.passes[p.pid]=true;delete q.claims[p.pid];emitRoom(r);maybeResolveMahjongReaction(r);return true}
function concealedKong(r,p,id){
 if(r.mahjongReaction||r.players[r.currentTurn]?.pid!==p.pid||tileCounts(p,id)!==4)return false;
 const ts=removeTiles(p,[id,id,id,id]);p.melds.push({type:"暗槓",tiles:ts});hist(r,`${p.name} 暗槓`);io.to("room:"+r.code).emit("gameSound",{game:"mahjong",action:"kong",playerName:p.name});
 if(r.wall.length){const kt=r.wall.pop();p.hand.push(kt);p.drawnUid=kt.uid}p.hand.sort((a,b)=>a.sort-b.sort);scheduleTurn(r);return true;
}

function timeoutTurn(r){
 if(r.status!=="playing"||r.currentTurn===null)return;
 if(r.game==="mahjong"&&r.mahjongReaction){resolveMahjongReaction(r);return;}const p=r.players[r.currentTurn];if(!p)return;
 if(r.game==="big2"){if(r.lastPlay)passBig2(r,p,true);else{let c=r.firstPlay?p.hand.find(x=>x.id==="3C"):p.hand[0];if(c)playBig2(r,p,[c.id],true)}}
 else if(r.game==="sevens"){const legal=p.hand.find(c=>sevenLegal(r,c));if(legal)playSeven(r,p,legal.id,false,true);else if(p.hand[0])playSeven(r,p,p.hand[0].id,true,true)}
 else if(r.game==="landlord"){if(r.lastPlay)passDDZ(r,p,true);else if(p.hand[0])playDDZ(r,p,[p.hand[0].id],true)}
 else if(r.game==="mahjong"){if(p.hand[0])discardMahjong(r,p,p.hand[0].id,true)}
}


function botName(r){let i=1,n;do n=`電腦${i++}`;while(r.players.some(p=>p.name===n));return n}
function addBot(r){if(r.game==="mahjong"||r.players.length>=GAME_META[r.game].players||!["waiting","countdown"].includes(r.status))return false;const p={pid:uid(),name:botName(r),socketId:null,connected:true,isBot:true,hand:[],covered:[],wins:0,role:null,submitted:false,melds:[],drawnUid:null};r.players.push(p);hist(r,`🤖 ${p.name} 加入房間`);emitRoom(r);maybeStart(r);return true}
function fillBots(r){if(!r||r.game==="mahjong"||!["waiting","countdown"].includes(r.status))return 0;let n=0;while(r.players.length<GAME_META[r.game].players){if(!addBot(r))break;n++}return n}
function scheduleAiFill(r){if(!r||r.aiMode!=="auto"||r.game==="mahjong"||r.aiFillTimer||!["waiting","countdown"].includes(r.status))return;if(!r.players.some(p=>!p.isBot))return;if(r.players.length>=GAME_META[r.game].players)return;r.aiFillDeadline=Date.now()+r.aiWaitSeconds*1000;r.aiFillTimer=setTimeout(()=>{r.aiFillTimer=null;r.aiFillDeadline=null;if(!rooms.has(r.code)||r.aiMode!=="auto"||!["waiting","countdown"].includes(r.status))return;const n=fillBots(r);if(n)hist(r,`🤖 等待時間到，自動補入 ${n} 位電腦玩家`);emitRoom(r)},r.aiWaitSeconds*1000);emitRoom(r)}
function big2BotChoice(r,p){const hand=[...p.hand];for(const c of hand)if(playBig2(r,p,[c.id],true))return true;for(let i=0;i<hand.length;i++)for(let j=i+1;j<hand.length;j++)if(playBig2(r,p,[hand[i].id,hand[j].id],true))return true;if(r.big2Mode==="traditional")for(const ids of comb(hand,3).map(x=>x.map(c=>c.id)))if(playBig2(r,p,ids,true))return true;for(const ids of comb(hand,5).map(x=>x.map(c=>c.id)))if(playBig2(r,p,ids,true))return true;return passBig2(r,p,true)}
function ddzBotChoice(r,p){for(const c of p.hand)if(playDDZ(r,p,[c.id],true))return true;for(let i=0;i<p.hand.length;i++)for(let j=i+1;j<p.hand.length;j++)if(playDDZ(r,p,[p.hand[i].id,p.hand[j].id],true))return true;return passDDZ(r,p,true)}
function maybeBotMove(r){if(!r||r.status!=="playing"||r.game==="mahjong")return;if(r.game==="chinese"){for(const p of r.players.filter(x=>x.isBot&&!x.submitted)){const rec=chineseRecommend(p.hand)[0]||autoArrange(p.hand);p.chinese=rec;p.submitted=true;hist(r,`${p.name}（系統）已完成排牌`)}emitRoom(r);if(r.players.every(x=>x.submitted))resolveChinese(r);return}const p=r.players[r.currentTurn];if(!p?.isBot)return;if(r.game==="big2")big2BotChoice(r,p);else if(r.game==="sevens"){const c=p.hand.find(x=>sevenLegal(r,x));playSeven(r,p,(c||p.hand[0])?.id,!c,true)}else if(r.game==="landlord")ddzBotChoice(r,p)}

io.on("connection",socket=>{
 socket.on("adminJoin",({ownerToken,adminToken}={})=>{
  ownerToken=String(ownerToken||"").trim();adminToken=String(adminToken||"");
  if(!validAdminToken(adminToken))return socket.emit("adminAuthFailed");
  if(!ownerToken)return socket.emit("notice","主控身分建立失敗，請重新整理");
  socket.data.adminAuthed=true;socket.data.adminOwnerToken=ownerToken;socket.join("admin:"+ownerToken);emitAdmins(ownerToken);emitArchives(ownerToken);
 });
 socket.on("createRoom",o=>{
  const owner=socket.data?.adminOwnerToken;if(!owner)return socket.emit("notice","請重新登入主控");
  const r=createRoom({...o,ownerToken:owner});hist(r,"房間已建立");emitRoom(r);socket.emit("notice",`房間 ${r.code} 已建立`);
 });
 socket.on("deleteRoom",({code})=>{
  const r=rooms.get(code);if(!r)return;
  if(!socket.data?.adminOwnerToken||r.ownerToken!==socket.data.adminOwnerToken)return socket.emit("notice","你沒有這個房間的管理權");
  clearAllTimers(r);archiveRoom(r);const a=roomArchives.get(r.code);if(a)a.status="closed";io.to("room:"+code).emit("roomDeleted");rooms.delete(code);emitAdmins(r.ownerToken);emitArchives(r.ownerToken);socket.emit("notice","房間已刪除，開房紀錄仍保留");
 });
 socket.on("startRoom",({code})=>{
  const r=rooms.get(code);if(!r)return socket.emit("notice","找不到房間");
  if(!socket.data?.adminOwnerToken||r.ownerToken!==socket.data.adminOwnerToken)return socket.emit("notice","你沒有這個房間的管理權");
  const x=manualStart(r);if(!x.ok)socket.emit("notice",x.msg);else socket.emit("notice","已啟動開始倒數");
 });
 socket.on("kickPlayer",({code,pid})=>{
  const r=rooms.get(code);if(!r)return socket.emit("notice","找不到房間");
  if(!socket.data?.adminOwnerToken||r.ownerToken!==socket.data.adminOwnerToken)return socket.emit("notice","你沒有這個房間的管理權");
  const p=r.players.find(x=>x.pid===pid);if(!p)return socket.emit("notice","找不到這位玩家");
  if(p.socketId){io.to(p.socketId).emit("kicked",{code:r.code});const ps=io.sockets.sockets.get(p.socketId);if(ps){ps.leave("room:"+r.code);ps.data={}}}
  r.players=r.players.filter(x=>x.pid!==p.pid);hist(r,`${p.name} 已被主控踢除`);
  clearAllTimers(r);clearTimer(r,"reactionTimer");r.status="waiting";r.round=0;resetRoundState(r);emitRoom(r);socket.emit("notice",`${p.name} 已踢除`);
 });
 socket.on("fillBots",({code})=>{const r=rooms.get(String(code||""));if(!r)return socket.emit("notice","找不到房間");if(r.ownerToken!==socket.data?.adminOwnerToken)return socket.emit("notice","你沒有管理權");if(r.game==="mahjong")return socket.emit("notice","麻將目前不提供電腦玩家");if(r.aiMode!=="manual")return socket.emit("notice","這間房不是主控手動補滿模式");const n=fillBots(r);socket.emit("notice",n?`已補入 ${n} 位電腦玩家`:"目前沒有空位需要補")});
 socket.on("removeBot",({code,pid})=>{const r=rooms.get(String(code||""));if(!r||r.ownerToken!==socket.data?.adminOwnerToken)return;const p=r.players.find(x=>x.pid===pid&&x.isBot);if(!p||!["waiting","countdown"].includes(r.status))return socket.emit("notice","只能在等待開始時移除電腦玩家");r.players=r.players.filter(x=>x.pid!==pid);hist(r,`🤖 ${p.name} 已移除`);emitRoom(r)});
 socket.on("getRoomArchives",()=>{const o=socket.data?.adminOwnerToken;if(o)emitArchives(o)});
 socket.on("deleteRoomArchive",({code})=>{const o=socket.data?.adminOwnerToken,a=roomArchives.get(String(code||""));if(!a||a.ownerToken!==o)return;roomArchives.delete(a.code);emitArchives(o);socket.emit("notice","開房紀錄已刪除")});
 socket.on("sendEmoji",({code,emoji})=>{const r=rooms.get(String(code||"")),p=r?.players.find(x=>x.pid===socket.data?.pid);const allowed=["👍","😂","😱","👏","😤","🤔"];if(!r||!p||!allowed.includes(emoji))return;const now=Date.now();if(p.lastEmojiAt&&now-p.lastEmojiAt<1000)return;p.lastEmojiAt=now;io.to("room:"+r.code).emit("emoji",{pid:p.pid,name:p.name,emoji});});
 socket.on("resumeRoom",({code,pid})=>{const r=rooms.get(String(code||"")),p=r?.players.find(x=>x.pid===String(pid||""));if(!r||!p||p.isBot)return socket.emit("resumeFailed");clearTimeout(p.disconnectGrace);p.disconnectGrace=null;p.connected=true;p.socketId=socket.id;socket.data={code:r.code,pid:p.pid};socket.join("room:"+r.code);socket.emit("joined",{code:r.code,pid:p.pid,resumed:true});hist(r,`${p.name} 連線已恢復`);emitRoom(r)});
 socket.on("joinRoom",({code,name,password})=>{
  const r=rooms.get(String(code||"").trim());if(!r)return socket.emit("errorMsg","找不到房間");
  name=String(name||"").trim().slice(0,12);if(!name)return socket.emit("errorMsg","請輸入玩家名稱");
  if(r.password&&String(password||"")!==r.password)return socket.emit("needPassword",true),socket.emit("errorMsg","房間密碼錯誤");
  if(!["waiting","countdown"].includes(r.status))return socket.emit("errorMsg","遊戲進行中，請等房間回到等待狀態再加入");
  if(r.players.some(x=>x.name.toLowerCase()===name.toLowerCase()))return socket.emit("errorMsg","此玩家名稱已有人使用");
  const need=GAME_META[r.game].players;
  if(r.players.length>=need){const bi=r.players.findIndex(x=>x.isBot);if(bi>=0&&["waiting","countdown"].includes(r.status)){const b=r.players.splice(bi,1)[0];hist(r,`👤 真人玩家加入，${b.name} 自動讓位`)}else return socket.emit("errorMsg","房間已滿")}
  const p={pid:uid(),name,socketId:socket.id,connected:true,hand:[],covered:[],wins:0,role:null,submitted:false,melds:[],drawnUid:null};
  r.players.push(p);socket.data={code:r.code,pid:p.pid};socket.join("room:"+r.code);hist(r,`${p.name} 加入房間`);
  socket.emit("joined",{code:r.code,pid:p.pid});emitRoom(r);scheduleAiFill(r);maybeStart(r);
 });
 socket.on("playCards",({code,ids})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p)return;let ok=r.game==="big2"?playBig2(r,p,ids||[]):r.game==="landlord"?playDDZ(r,p,ids||[]):false;if(!ok)socket.emit("errorMsg","這手牌目前不能出")});
 socket.on("pass",({code})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p)return;const ok=r.game==="big2"?passBig2(r,p):r.game==="landlord"?passDDZ(r,p):false;if(!ok)socket.emit("errorMsg","現在不能 PASS")});
 socket.on("sevenAction",({code,id,cover})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="sevens")return;if(!playSeven(r,p,id,!!cover))socket.emit("errorMsg",cover?"你還有合法牌可出，不能蓋牌":"這張牌目前不能出")});
 socket.on("submitChinese",({code,front=[],middle=[],back=[]})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="chinese"||p.submitted)return;
 const by=id=>p.hand.find(c=>c.id===id),x={front:front.map(by).filter(Boolean),middle:middle.map(by).filter(Boolean),back:back.map(by).filter(Boolean)};
 const all=[...front,...middle,...back];if(all.length!==13||new Set(all).size!==13||!chineseValid(x))return socket.emit("errorMsg","排牌不合法：需前3、中5、後5，且後墩 ≥ 中墩 ≥ 前墩");
 p.chinese=x;p.submitted=true;hist(r,`${p.name} 已完成排牌`);io.to("room:"+r.code).emit("gameSound",{game:"chinese",action:"submit",playerName:p.name});emitRoom(r);if(r.players.every(x=>x.submitted))resolveChinese(r)});
 socket.on("mahjongDiscard",({code,uid:tileUid,id})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="mahjong")return;if(!discardMahjong(r,p,tileUid||id))socket.emit("errorMsg","目前不能打這張牌")});
 socket.on("mahjongWin",({code})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="mahjong")return;if(r.mahjongReaction){if(!mahjongClaim(r,p,"win"))socket.emit("errorMsg","目前不能胡牌");return}if(r.players[r.currentTurn]?.pid!==p.pid)return socket.emit("errorMsg","還沒輪到你");if(mahjongWinPlayer(p)){finishRound(r,p)}else socket.emit("errorMsg","目前牌型尚未胡牌")});
 socket.on("mahjongClaim",({code,type,ids})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="mahjong")return;if(!mahjongClaim(r,p,type,ids||[]))socket.emit("errorMsg","目前不能執行這個動作")});
 socket.on("mahjongPass",({code})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="mahjong")return;mahjongPass(r,p)});
 socket.on("mahjongConcealedKong",({code,id})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p||r.game!=="mahjong")return;if(!concealedKong(r,p,id))socket.emit("errorMsg","目前不能暗槓")});
 socket.on("leaveRoom",({code})=>{const r=rooms.get(code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p)return;r.players=r.players.filter(x=>x.pid!==p.pid);hist(r,`${p.name} 離開房間`);clearAllTimers(r);r.status="waiting";r.round=0;resetRoundState(r);emitRoom(r);socket.leave("room:"+code);socket.data={};});
 socket.on("disconnect",()=>{
  const r=rooms.get(socket.data?.code),p=r?.players.find(x=>x.pid===socket.data?.pid);if(!r||!p)return;
  p.connected=false;p.socketId=null;hist(r,`${p.name} 連線不穩，等待短暫恢復`);emitRoom(r);
  clearTimeout(p.disconnectGrace);p.disconnectGrace=setTimeout(()=>{if(p.connected)return;r.players=r.players.filter(x=>x.pid!==p.pid);hist(r,`${p.name} 已離開房間`);clearAllTimers(r);clearTimer(r,"reactionTimer");r.status="waiting";r.round=0;resetRoundState(r);emitRoom(r);maybeStart(r)},30000);
 });
});

server.listen(PORT,"0.0.0.0",()=>console.log(`Card Hall V2.0.6 Official running on http://localhost:${PORT}`));
