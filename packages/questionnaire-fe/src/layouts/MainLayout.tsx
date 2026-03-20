import React from 'react'
import { Link, Outlet } from 'react-router-dom'
import Logo from '@/layouts/components/Logo'
import UserMenu from '@/layouts/components/UserMenu'
import CustomSpin from '@/components/CustomSpin/CustomSpin'
import { Spin } from 'antd'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'

const MainLayout: React.FC = () => {
  const screenSpinning = useSelector((state: RootState) => state.utils.screenSpinning)
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-[#E8F5F3] to-[#F1F8E9] flex flex-col overflow-hidden">
      <div className="h-[68px] flex justify-between items-center px-6 shrink-0 z-10 border-b border-gray-200/50 bg-white/30 backdrop-blur-md sticky top-0">
        <Logo />
        <UserMenu />
      </div>
      <main className="flex-1 flex flex-col items-center justify-center overflow-hidden">
        <Outlet />
      </main>
      <footer className="custom-footer shrink-0">
        <div>
          问卷小筑 &copy;2025 - present. Maintained by{' '}
          <Link to="mailto:xueldx@163.com">xueldx</Link>
        </div>
      </footer>
      <Spin indicator={<CustomSpin />} spinning={screenSpinning} fullscreen />
    </div>
  )
}

export default MainLayout
