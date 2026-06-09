# GitHub Pages 授權與部署

## 1. 建立 GitHub Token

最簡單方式：建立 classic token。

網址：

```text
https://github.com/settings/tokens/new?description=liquid-level-calculator-deploy&scopes=repo
```

設定：

- Note: `liquid-level-calculator-deploy`
- Expiration: 建議 7 天或更短
- Select scopes: 勾選 `repo`

部署完成後可到 GitHub 刪除這個 token。

## 2. 執行部署

在終端機執行：

```bash
cd "/Users/imac/codex本機/人力管理/outputs/github-pages/liquid-level-calculator"
./deploy_github_pages.py
```

腳本會提示貼上 token。輸入時不會顯示。

## 3. 腳本會自動完成

- 建立 public repo：`liquid-level-calculator`
- 上傳網站檔案到 repo 根目錄
- 啟用 GitHub Pages
- 輸出公開網址

預期網址：

```text
https://<github-username>.github.io/liquid-level-calculator/
```
