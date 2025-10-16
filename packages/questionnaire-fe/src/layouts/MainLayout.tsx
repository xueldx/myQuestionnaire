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
    <div className="custom-app">
      <header className="custom-header">
        <Logo />
        <UserMenu />
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="custom-footer">
        <div>
          问卷小筑 &copy;2025 - present. Created by <Link to="mailto:xueldx@163.com">xueldx</Link>
        </div>
        </footer>
      <Spin indicator={<CustomSpin />} spinning={screenSpinning} fullscreen />
    </div>
  )
}

export default MainLayout
