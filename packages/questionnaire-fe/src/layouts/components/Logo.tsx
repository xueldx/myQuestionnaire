import React from 'react'
import { Link } from 'react-router-dom'
import { HOME_PATH } from '@/router'
import { FormOutlined } from '@ant-design/icons'

const Logo: React.FC = () => {
  return (
    <div className="flex items-center gap-2">
      <Link to={HOME_PATH} className="flex items-center gap-2 no-underline hover:opacity-80">
        <FormOutlined className="text-[26px] text-[#408D86]" />
        <span className="text-[18px] font-bold text-[#408D86] tracking-wide">问卷小筑</span>
      </Link>
    </div>
  )
}

export default Logo
