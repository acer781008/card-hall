
const socket=io(),$=s=>document.querySelector(s),toast=m=>{const n=$("#notice");n.textContent=m;n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1600)};
socket.emit("adminJoin");socket.on("notice",toast);
$("#create").onclick=()=>socket.emit("createRoom",{game:$("#game").value,password:$("#password").value,autoStart:$("#auto").value==="1",startCountdown:+$("#startCd").value,turnSeconds:+$("#turn").value,totalRounds:+$("#rounds").value,betweenSeconds:+$("#between").value,continuous:$("#continuous").value==="1"});
socket.on("roomsList",rs=>{window.rs=rs;$("#rooms").innerHTML=rs.length?rs.map(r=>`<div class="room"><div class="roomHead"><div><b>${r.gameName}</b>　房號 <span class="code">${r.code}</span></div><span class="tag">${fmt(r.status)}</span></div>
<div class="seats">${Array.from({length:r.needPlayers},(_,i)=>r.players[i]?`<div class="seat ${r.players[i].connected?"":"off"}">👤 ${esc(r.players[i].name)}<br><small>${r.players[i].connected?"🟢 在線":"⚪ 斷線保留"}｜🏆 ${r.players[i].wins} 勝${r.players[i].covered?`｜蓋牌 ${r.players[i].covered}`:""}</small></div>`:`<div class="seat off">等待玩家</div>`).join("")}</div>
<div>連線 <b>${r.connectedCount}/${r.needPlayers}</b>｜共 <b>${r.totalRounds}</b> 回合｜出牌 <b>${r.turnSeconds}</b> 秒｜回合間隔 <b>${r.betweenSeconds}</b> 秒｜持續 <b>${r.continuous?"是":"否"}</b></div>${r.testNote?`<div class="rules">ℹ️ ${esc(r.testNote)}</div>`:""}
<div class="actions">${(!r.autoStart&&["waiting","countdown"].includes(r.status))?`<button class="btn gold" onclick="startRoom('${r.code}')">▶ 開始遊戲</button>`:""}<button class="btn blue" onclick="copyUrl('${r.code}')">複製玩家網址</button><button class="btn green" onclick="copyShare('${r.code}')">複製文字分享</button><button class="btn purple" onclick="showRules('${r.game}')">查看規則</button><button class="btn red" onclick="delRoom('${r.code}')">刪除房間</button></div></div>`).join(""):"<p>目前沒有房間。</p>"});
async function cp(t,msg){try{await navigator.clipboard.writeText(t);toast(msg)}catch{prompt(msg,t)}}
function copyUrl(c){cp(`${location.origin}/player.html?room=${c}`,"玩家網址已複製")}
function copyShare(c){const r=window.rs.find(x=>x.code===c),url=`${location.origin}/player.html?room=${c}`;cp(`🎴 多人棋牌館｜${r.gameName}\n房號：${r.code}\n房間密碼：${r.passwordRequired?"有設定，請向主控取得":"無"}\n${r.needPlayers} 人｜${r.autoStart?"滿員自動開始":"由主控手動開始"}\n共 ${r.totalRounds} 回合\n出牌考慮時間：${r.turnSeconds} 秒\n回合結束 ${r.betweenSeconds} 秒後進入下一回合\n🔄 斷線或重新整理頁面，可在 60 秒內回到原座位繼續遊戲\n📖 詳細規則：進房後可查看\n玩家連結：${url}`,"文字分享已複製")}
function startRoom(c){socket.emit("startRoom",{code:c})}
function delRoom(c){if(confirm("確定刪除房間 "+c+"？"))socket.emit("deleteRoom",{code:c})}
function showRules(g){alert(rule(g))}
function rule(g){if(g==="big2")return "大老二：3 最小、2 最大；花色 ♣<♦<♥<♠；♣3 持有者先出且第一手需含 ♣3；支援單張、對子、三條、順子、同花、葫蘆、鐵支、同花順。";if(g==="sevens")return "牌七：持有 ♠7 先出；同花色由 7 往上／往下接；若手上沒有任何合法牌，必須選一張蓋牌；手牌先清空者獲勝。";if(g==="chinese")return "十三支：13 張分前3、中5、後5；V1.0 先採自動排牌完成多人比牌流程。";if(g==="landlord")return "鬥地主公開測試：54 張（含大小王），3 人各 17 張＋地主 3 張底牌；目前地主由系統隨機。支援單張、對子、三條、三帶一／二、順子、連對、無翅膀飛機、炸彈、王炸。";return "麻將：台灣 16 張；每人平常 16 張，摸牌後 17 張再打一張；支援吃、碰、明槓、暗槓、自摸、放槍胡與過。吃只能吃上家；基本胡牌結構為五組面子＋一對將。本公開測試版尚未加入花牌補花。"}
function fmt(s){return({waiting:"等待玩家",countdown:"倒數中",playing:"遊戲中",round_end:"回合結束",finished:"本場完成"})[s]||s}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
