import React, { useRef } from 'react'
import { useParams } from 'react-router-dom'
import { QRCode, Button, Tooltip, App } from 'antd'
import { CopyOutlined, QrcodeOutlined } from '@ant-design/icons'

const Qrcode = () => {
  const { message } = App.useApp()
  const { id } = useParams()
  // 根据环境变量决定客户端域名，如果是本地开发则指向8878端口，否则默认使用当前域名
  const clientUrl = import.meta.env.VITE_CLIENT_URL || window.location.origin
  const url = `${clientUrl}/client/question?id=${id}`
  const qrRef = useRef<HTMLDivElement>(null)

  // 复制链接到剪贴板
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      message.success('链接已复制到剪贴板')
    } catch (e) {
      message.error('复制失败，请手动复制')
    }
  }

  // 复制二维码图片到剪贴板
  const handleCopyQrcode = async () => {
    try {
      // 获取canvas元素
      const canvas = qrRef.current?.querySelector('canvas') as HTMLCanvasElement
      if (!canvas) throw new Error('未找到二维码')
      // 转为blob
      canvas.toBlob(async blob => {
        if (!blob) throw new Error('二维码转图片失败')
        try {
          // 复制到剪贴板
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
          message.success('二维码图片已复制到剪贴板')
        } catch (err) {
          message.error('复制失败，建议使用最新版Chrome/Edge浏览器')
        }
      }, 'image/png')
    } catch (e) {
      message.error('复制失败，建议使用最新版Chrome/Edge浏览器')
    }
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 overflow-hidden">
      <div className="bg-white rounded-xl shadow-lg p-8 flex flex-col items-center max-w-md">
        <h2 className="mb-6 text-3xl font-extrabold text-custom-primary-100 tracking-wider">
          扫码答题
        </h2>
        <div ref={qrRef}>
          <QRCode
            value={url}
            size={220}
            className="my-4 border-4 border-custom-primary-100 rounded-lg shadow-md"
          />
        </div>
        <div className="flex gap-4 mt-6 w-full">
          <Tooltip title="复制二维码图片">
            <Button icon={<QrcodeOutlined />} onClick={handleCopyQrcode} type="primary" ghost block>
              复制二维码
            </Button>
          </Tooltip>
          <Tooltip title="复制答题链接">
            <Button icon={<CopyOutlined />} onClick={handleCopyLink} type="primary" block>
              复制链接
            </Button>
          </Tooltip>
        </div>
        <div className="mt-6 w-full p-4 bg-custom-bg-100 rounded-lg">
          <div className="text-sm text-custom-text-200 break-all text-center">
            <div className="font-semibold text-custom-primary-100 mb-2">答题链接：</div>
            <span className="select-all text-xs">{url}</span>
          </div>
        </div>
      </div>
      <div className="mt-8 text-sm text-custom-text-200 opacity-70 text-center">
        请用微信或浏览器扫码，或复制链接到新窗口打开
      </div>
    </div>
  )
}

export default Qrcode
