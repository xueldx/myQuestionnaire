export default (verificationCode, expirationTime) => {
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>问卷小筑 - 验证码</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap');
            
            body {
                font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
                background-color: #f4f7f6;
                margin: 0;
                padding: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }
            .container {
                max-width: 500px;
                width: 90%;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(67, 144, 136, 0.1);
            }
            .header {
                background: linear-gradient(135deg, #439088 0%, #357a72 100%);
                padding: 40px 20px;
                text-align: center;
                color: white;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
                letter-spacing: 2px;
            }
            .content {
                padding: 40px;
                color: #2c3e50;
                line-height: 1.8;
            }
            .greeting {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 20px;
                color: #439088;
            }
            .message {
                margin-bottom: 30px;
                color: #5a6c7d;
            }
            .code-wrapper {
                background: #f0f7f6;
                border: 2px dashed #439088;
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                margin: 30px 0;
            }
            .verification-code {
                font-family: 'Courier New', Courier, monospace;
                font-size: 30px;
                letter-spacing: 8px;
                color: #439088;
                font-weight: 700;
                margin: 0;
            }
            .expiry {
                font-size: 13px;
                color: #94a3b8;
                text-align: center;
                margin-top: 10px;
            }
            .footer {
                padding: 30px;
                background: #fafafa;
                text-align: center;
                border-top: 1px solid #edf2f7;
            }
            .footer p {
                margin: 5px 0;
                font-size: 14px;
                color: #64748b;
            }
            .brand {
                font-weight: 700;
                color: #439088;
                font-size: 16px;
                margin-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>问卷小筑</h1>
            </div>
            <div class="content">
                <div class="greeting">亲爱的用户，您好！</div>
                <div class="message">
                    感谢您信任并使用<strong>问卷小筑</strong>。为了保障您的账户安全，我们正在进行身份验证。如果您本人未进行此操作，请忽略此邮件。
                </div>
                <div class="code-wrapper">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">您的验证码为：</p>
                    <h2 class="verification-code">${verificationCode}</h2>
                </div>
                <p class="expiry">此验证码将在 ${expirationTime / 60} 分钟后失效，请及时使用。</p>
            </div>
            <div class="footer">
                <p>如果您有任何疑问或需要帮助，请随时联系我们。</p>
                <div class="brand">问卷小筑</div>
                <p style="margin-top: 15px; font-size: 12px; color: #cbd5e1;">© ${new Date().getFullYear()} 问卷小筑. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};
