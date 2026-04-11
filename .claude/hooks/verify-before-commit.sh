#!/bin/bash
# git commit 前に動作確認（Playwrightでのスクショ・UI検証）を促す
# プロジェクト固有フック: kurimats-emulator

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# git commit でなければスキップ
[[ ! "$CMD" =~ git\ commit ]] && exit 0

# マージコミット・amend等はスキップ
[[ "$CMD" =~ --allow-empty ]] && exit 0

# 警告メッセージを注入（ブロックではなく注意喚起）
echo "⚠️ 動作確認チェック: コミット前にPlaywrightでUI操作・スクショ撮影による目視確認は完了しましたか？"
echo ""
echo "未実施の場合はコミットを中断し、以下を実施してください:"
echo "1. dev serverを起動 (PANE_NUMBER=N npm run dev)"
echo "2. Playwrightでブラウザを開き、変更箇所の画面を表示"
echo "3. スクリーンショットを撮影して目視確認"
echo "4. Issueの「動作確認」セクションに記載された手順を実行"
echo ""
echo "動作確認が不要な変更（CI設定・ドキュメント・型定義のみ等）の場合はそのまま続行してください。"

exit 0
