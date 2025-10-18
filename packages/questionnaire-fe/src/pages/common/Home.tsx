import React from 'react'
import { useNavigate } from 'react-router-dom'
import { MANAGE_PERSONAL_PATH } from '@/router'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { Button } from 'antd'
import SvgIcon from '@/components/Common/SvgIcon'
// import LottieAnimation from '@/components/Common/LottieAnimation'
// import aiTransform from '@/assets/lottie/aiTransform.json'
// import report from '@/assets/lottie/report.json'
// import stat from '@/assets/lottie/stat.json'
// import Lottie, { LottieComponentProps } from 'lottie-react'

const Home: React.FC = () => {
  const nav = useNavigate()

  // 配置 GSAP 动画
  useGSAP(() => {
    const tl = gsap.timeline()
    tl.from('#hero-content > *', {
      y: 30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out'
    })
    tl.from(
      '#visual-content',
      {
        scale: 0.9,
        opacity: 0,
        duration: 1.2,
        ease: 'power2.out'
      },
      '-=0.5'
    )
  })

  const cardInfoList = [
    { title: 'AI生成问卷', icon: 'generate' },
    { title: '实时数据监控', icon: 'monitor' },
    { title: 'AI可视化数据分析', icon: 'analysis' },
    { title: '导出结果报告', icon: 'report' }
  ]

  return (
    <div className="custom-home-container max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="custom-hero-section" id="hero-content">
        <h1 className="custom-main-title" id="title">
          问卷调查 <br /> 在线投票
        </h1>
        <p className="mb-10 text-xl font-medium text-[#59A199]/80 leading-relaxed" id="description">
          极致简单的问卷创建体验， <br />
          多维数据分析，AI 智能辅助，助力高效决策。
        </p>
        <div id="startBtn" className="flex gap-4">
          <Button
            className="!rounded-full !h-14 !px-10 !text-xl !bg-gradient-to-r from-[#59A199] to-[#408D86] !text-white !border-none hover:opacity-90 flex items-center justify-center gap-2 shadow-xl hover:shadow-[#408D86]/20 transition-all duration-300"
            onClick={() => nav(MANAGE_PERSONAL_PATH)}
          >
            开始使用
          </Button>
        </div>
      </div>

      {/* Visual Section */}
      <div className="custom-visual-section" id="visual-content">
        <div className="custom-intro-lottie">
          {/* <LottieAnimation animationData={aiTransform} /> */}
          {/* <Lottie animationData={aiTransform} loop={true} autoplay={true} /> */}
        </div>

        <div className="custom-feature-grid gap-4">
          {cardInfoList.map(item => (
            <div className="custom-mini-card group" key={item.title}>
              <div className="group-hover:scale-110 transition-transform duration-300">
                <SvgIcon name={item.icon} size="7.5rem" color="#408D86" />
              </div>
              <span className="custom-mini-card-title">{item.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Home
