多人棋牌館 V2.0 正式版

主控登入：https://card-hall.onrender.com/admin-login.html
玩家頁：https://card-hall.onrender.com/player.html
返回遊戲大廳：https://game-lobby-eo8o.onrender.com/

【Render 主控密碼】
請在 Render → Environment 設定：
ADMIN_PASSWORD = 你自己的主控密碼
修改後重新部署即可，不需把密碼寫進 GitHub。

【V2.0 主要內容】
- 五款遊戲：大老二、接龍、十三支、鬥地主、麻將
- 大老二：同牌型才能壓；順子 A2345 最小、23456 最大；手機直式手牌優化
- 接龍：玩家手牌依花色分組，花色內 A→K；中央固定 A→K 位置；合法牌高亮；有牌不能蓋
- 十三支：前3／中5／後5手動排牌＋3組推薦＋合法順序檢查
- 麻將：台灣16張、吃碰槓胡；最新棄牌中央放大並在棄牌區高亮
- 五款共用6個快捷表情
- 大老二／接龍出牌操作聲音；麻將語音／音效
- 主控自訂密碼改用 Render ADMIN_PASSWORD；Socket 主控操作也驗證登入 token
- 短暫網路瞬斷提供約8秒 transport grace，不是舊60秒座位保留
- 房間對戰結果隨房間保留，刪除房間後一起刪除

【上 GitHub】
請上傳：server.js、package.json、render.yaml、public 整個資料夾。
不要直接上傳 ZIP。
