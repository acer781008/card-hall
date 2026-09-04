const ADMIN_OWNER_KEY="cardhall_admin_owner_v112";
let adminOwnerToken=localStorage.getItem(ADMIN_OWNER_KEY);
if(!adminOwnerToken){adminOwnerToken=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(ADMIN_OWNER_KEY,adminOwnerToken)}

const ADMIN_TOKEN=localStorage.getItem("cardhall_admin_token_v2");const socket=io(),$=s=>document.querySelector(s),toast=m=>{const n=$("#notice");n.textContent=m;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1600)};
socket.on("connect",()=>socket.emit("adminJoin",{ownerToken:adminOwnerToken,adminToken:ADMIN_TOKEN}));socket.on("notice",toast);socket.on("adminAuthFailed",()=>{localStorage.removeItem("cardhall_admin_token_v2");location.replace("admin-login.html")});
function syncAiFields(){const m=$("#aiMode").value,auto=m==="auto";$("#aiWaitField").style.display=auto?"":"none";$("#aiCustomField").style.display=auto&&$("#aiWait").value==="custom"?"":"none"}
$("#aiMode").onchange=syncAiFields;$("#aiWait").onchange=syncAiFields;function syncGameFields(){const g=$("#game").value;$("#big2ModeField").style.display=g==="big2"?"":"none";if(g==="mahjong")$("#aiMode").value="none";syncAiFields()}
$("#game").onchange=syncGameFields;syncGameFields();
$("#create").onclick=()=>{const m=$("#game").value==="mahjong"?"none":$("#aiMode").value,w=$("#aiWait").value==="custom"?+$("#aiCustom").value:+$("#aiWait").value;socket.emit("createRoom",{ownerToken:adminOwnerToken,game:$("#game").value,password:$("#password").value,autoStart:$("#auto").value==="1",startCountdown:+$("#startCd").value,totalRounds:+$("#rounds").value,betweenSeconds:+$("#between").value,continuous:$("#continuous").value==="1",aiMode:m,aiWaitSeconds:w,big2Mode:$("#big2Mode").value,turnSeconds:+$("#turnSeconds").value,shareNote:$("#shareNote").value,scoreEnabled:$("#scoreEnabled").value==="1",ninety9Mode:$("#ninety9Mode").value})};
socket.on("roomsList",rs=>{window.rs=rs;$("#rooms").innerHTML=rs.length?rs.map(r=>`<div class="room"><div class="roomHead"><div><b>${r.gameName}</b>　房號 <span class="code">${r.code}</span></div><span class="tag">${fmt(r.status)}</span></div>
<div class="seats">${Array.from({length:r.needPlayers},(_,i)=>r.players[i]?`<div class="seat ${r.players[i].connected?"":"off"}">${r.players[i].isBot?"🤖":"👤"} ${esc(r.players[i].name)}<br><small>${r.players[i].isBot?"🤖 系統玩家":(r.players[i].connected?"🟢 在線":"⚪ 斷線保留")}｜🏆 ${r.players[i].wins} 勝${r.players[i].covered?`｜蓋牌 ${r.players[i].covered}`:""}</small><br>${r.players[i].isBot?`<button class="botMini" onclick="removeBot('${r.code}','${r.players[i].pid}')">移除電腦</button>`:`<button class="kickMini" onclick="kickPlayer('${r.code}','${r.players[i].pid}')">踢除玩家</button>`}</div>`:`<div class="seat off">等待玩家</div>`).join("")}</div>
<div>連線 <b>${r.connectedCount}/${r.needPlayers}</b>｜出牌 <b>${r.turnSeconds?`${r.turnSeconds} 秒`:"不限時"}</b>｜共 <b>${r.totalRounds}</b> 回合｜回合間隔 <b>${r.betweenSeconds}</b> 秒｜持續 <b>${r.continuous?"是":"否"}</b>｜${r.game==="big2"?`玩法 <b>${r.big2Mode==="traditional"?"傳統版":"經典版"}</b>｜`:""}${r.scoreEnabled?`積分 <b>開啟</b>｜`:""}${r.game==="ninety9"?`99玩法 <b>${r.ninety9Mode==="special"?"特殊牌版":"基本版"}</b>｜`:""}AI <b>${r.aiMode==="manual"?"主控手動補滿":r.aiMode==="auto"?`等待 ${r.aiWaitSeconds} 秒自動補滿`:"不使用"}</b></div>${r.winner?`<div class="rules" style="font-size:18px;font-weight:900">🏆 第 ${r.round} 回合獲勝：${esc(r.winner.name)}</div>`:""}${r.testNote?`<div class="rules">ℹ️ ${esc(r.testNote)}</div>`:""}
<div class="actions">${r.game!=="mahjong"&&r.aiMode==="manual"&&["waiting","countdown"].includes(r.status)&&r.players.length<r.needPlayers?`<button class="btn blue" onclick="fillBots('${r.code}')">🤖 AI補滿</button>`:""}${(!r.autoStart&&["waiting","countdown"].includes(r.status))?`<button class="btn gold" onclick="startRoom('${r.code}')">▶ 開始遊戲</button>`:""}<button class="btn blue" onclick="copyUrl('${r.code}')">複製玩家網址</button><button class="btn green" onclick="copyShare('${r.code}')">複製文字分享</button><button class="btn purple" onclick="showRules('${r.game}')">查看規則</button><button class="btn historyBtn" onclick="showResults('${r.code}')">📋 對戰紀錄</button><button class="btn green" onclick="copyResults('${r.code}')">📄 複製分數紀錄</button><button class="btn red" onclick="delRoom('${r.code}')">刪除房間</button></div></div>`).join(""):"<p>目前沒有房間。</p>"});
async function cp(t,msg){try{await navigator.clipboard.writeText(t);toast(msg)}catch{prompt(msg,t)}}
function copyUrl(c){cp(`${location.origin}/player.html?room=${c}`,"玩家網址已複製")}
function copyShare(c){const r=window.rs.find(x=>x.code===c),url=`${location.origin}/player.html?room=${c}`;let ai="";if(r.aiMode==="auto")ai=`\n🤖 ${r.aiWaitSeconds} 秒內未滿員，系統自動補齊 AI 玩家`;let note=r.shareNote?`\n📝 ${r.shareNote}`:"";let turn=r.turnSeconds?`\n⏱️ 每次出牌 ${r.turnSeconds} 秒`:`\n⏱️ 出牌不限時`;cp(`🎴 多人棋牌館${note}\n房號：${r.code}\n房間密碼：${r.passwordRequired?"有設定，請向主控取得":"無"}\n${r.needPlayers} 人｜${r.autoStart?"滿員自動開始":"由主控手動開始"}${ai}${turn}\n共 ${r.totalRounds} 回合\n回合結束 ${r.betweenSeconds} 秒後進入下一回合\n📖 詳細規則：進房後可查看\n玩家連結：${url}`,"文字分享已複製")}
function startRoom(c){socket.emit("startRoom",{code:c})}
function kickPlayer(c,pid){const r=window.rs.find(x=>x.code===c),p=r?.players.find(x=>x.pid===pid);if(confirm(`確定踢除 ${p?.name||"這位玩家"}？\n若遊戲進行中，本局會回到等待玩家。`))socket.emit("kickPlayer",{code:c,pid})}
function delRoom(c){if(confirm("確定刪除房間 "+c+"？"))socket.emit("deleteRoom",{code:c})}
function showRules(g){alert(rule(g))}
function rule(g){if(g==="big2")return "大老二：建立房間可選經典版／傳統版。經典版不可單獨出三條；傳統版可單獨出三條。3 最小、2 最大；花色 ♣<♦<♥<♠；♣3 持有者先出且第一手需含 ♣3。鐵支必須由四張同點數＋任意一張組成，共 5 張；鐵支可跨牌型壓一般牌型；同花順可壓一般牌型與鐵支。";if(g==="sevens")return "接龍：持有 ♠7 先出；同花色由 7 往上／往下接；沒有合法牌時必須蓋牌。最先出完手牌者獲勝 +10 分；其他玩家每剩 1 張牌 -1 分。";if(g==="chinese")return "十三支：13 張分前3、中5、後5；可手動分成前3、中5、後5，也可套用推薦排法；後墩需 ≥ 中墩 ≥ 前墩。";if(g==="landlord")return "鬥地主：54 張（含大小王），3 人各 17 張＋地主 3 張底牌；目前地主由系統隨機。支援單張、對子、三條、三帶一／二、順子、連對、無翅膀飛機、炸彈、王炸。";if(g==="mahjong")return "麻將：台灣 16 張；每人平常 16 張，摸牌後 17 張再打一張；支援吃、碰、明槓、暗槓、自摸、放槍胡與過。吃只能吃上家；基本胡牌結構為五組面子＋一對將。目前未加入花牌補花。";if(g==="ninety9")return "99：基本版為輪流出牌累加且不可超過99。特殊牌版：A +1；4 迴轉；5 指定下一位；10 可選 +10/-10；J 跳過；Q 可選 +20/-20；K 直接變99。";if(g==="redpoint")return "撿紅點：輪到你時先出 1 張手牌；能與海底牌配對就把兩張一起收進得分區，不能配對則出的牌留在海底。接著翻 1 張牌堆牌；能配對就吃走，不能配對則留在海底。A～9 兩張相加必須等於 10；10、J、Q、K 必須相同才能吃。♥♦ 紅牌：A=20 分；2=2 分、3=3 分、4=4 分、5=5 分、6=6 分、7=7 分、8=8 分；9、10、J、Q、K=10 分；♠♣ 黑牌=0 分。整副 52 張全部處理完才結算，紅點總分最高者獲勝。";if(g==="blackjack")return "21點：每人兩張起手牌，可要牌或停牌；超過 21 點爆牌。Blackjack +20、一般勝莊家 +10、平手 0、輸莊家或爆牌 -5。";return "德州撲克娛樂制：每人 2 張手牌＋5 張公共牌，以最佳 5 張牌型比大小；每階段可繼續或棄牌。每局贏家 +10，其他玩家 -5；不含下注或籌碼。"}
function fmt(s){return({waiting:"等待玩家",countdown:"倒數中",playing:"遊戲中",round_end:"回合結束",finished:"本場完成"})[s]||s}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function showResults(c){const r=window.rs.find(x=>x.code===c),x=r?.matchResults||[];if(!x.length)return alert("目前還沒有已完成的對戰紀錄");alert(x.map(v=>`🏆 第 ${v.round} 回合｜勝者：${v.winner}${v.detail?`\n${v.detail}`:""}\n${(v.players||[]).map(p=>`${p.name}：總分 ${p.points}`).join("｜")}`).join("\n\n"))}
function resultText(r){
 const x=r?.matchResults||[];if(!x.length)return "目前還沒有已完成的對戰紀錄";
 return `🎴 ${r.gameName}｜房號 ${r.code}\n`+x.map(v=>{
   const lines=[`🏆 第 ${v.round} 回合｜勝者：${v.winner}`];
   if(v.detail)lines.push(v.detail);
   if(v.players?.length)lines.push(v.players.map(p=>`${p.name}：累積 ${p.points??0} 分｜${p.wins??0} 勝`).join("｜"));
   return lines.join("\n");
 }).join("\n\n");
}
function copyResults(c){const r=window.rs.find(x=>x.code===c);if(!r?.matchResults?.length)return toast("目前還沒有分數紀錄");cp(resultText(r),"分數紀錄已複製")}


function fillBots(c){socket.emit("fillBots",{code:c})}
function removeBot(c,pid){if(confirm("確定移除這位電腦玩家？"))socket.emit("removeBot",{code:c,pid})}
let archives=[];socket.on("roomArchives",xs=>{archives=xs||[];renderArchives()});socket.on("connect",()=>setTimeout(()=>socket.emit("getRoomArchives"),250));
function renderArchives(){const el=$("#archives");if(!el)return;el.innerHTML=archives.length?archives.map(a=>`<div class="archiveCard"><b>${esc(a.gameName)}｜房號 ${esc(a.code)}</b><br><small>建立：${new Date(a.createdAt).toLocaleString("zh-TW")}｜最後活動：${new Date(a.lastActiveAt).toLocaleString("zh-TW")}｜回合：${a.rounds||0}</small><br><small>參加：${(a.players||[]).map(esc).join("、")||"尚無玩家"}</small><div class="actions"><button class="btn historyBtn" onclick="showArchive('${a.code}')">📋 查看結果</button><button class="btn green" onclick="copyArchive('${a.code}')">📄 複製紀錄</button><button class="btn red" onclick="deleteArchive('${a.code}')">🗑 刪除紀錄</button></div></div>`).join(""):"<p>目前沒有開房紀錄。</p>"}
function showArchive(c){const a=archives.find(x=>x.code===c),x=a?.results||[];alert(x.length?x.map(v=>`🏆 第 ${v.round} 回合｜勝者：${v.winner}${v.detail?`\n${v.detail}`:""}`).join("\n\n"):"這間房目前沒有完成的回合紀錄")}
function copyArchive(c){const a=archives.find(x=>x.code===c),x=a?.results||[];if(!x.length)return toast("這間房目前沒有完成的回合紀錄");const t=`🎴 ${a.gameName}｜房號 ${a.code}\n`+x.map(v=>{const z=[`🏆 第 ${v.round} 回合｜勝者：${v.winner}`];if(v.detail)z.push(v.detail);if(v.players?.length)z.push(v.players.map(p=>`${p.name}：累積 ${p.points??0} 分｜${p.wins??0} 勝`).join("｜"));return z.join("\n")}).join("\n\n");cp(t,"紀錄已複製")}

function deleteArchive(c){if(confirm(`確定永久刪除房號 ${c} 的開房紀錄？`))socket.emit("deleteRoomArchive",{code:c})}

function sync99Field(){const e=document.querySelector("#ninety9ModeField");if(e)e.style.display=document.querySelector("#game").value==="ninety9"?"":"none"}document.querySelector("#game")?.addEventListener("change",sync99Field);sync99Field();
