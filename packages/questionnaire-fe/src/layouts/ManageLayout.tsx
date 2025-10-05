import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useRequest } from 'ahooks'
import apis from '@/apis'
import { Button, Divider, Space } from 'antd'
import { FileAddFilled, AppstoreFilled, FormOutlined, DeleteOutlined } from '@ant-design/icons'
import SvgIcon from '@/components/Common/SvgIcon'
import {
  MANAGE_MARKET_PATH,
  MANAGE_PERSONAL_PATH,
  MANAGE_STAR_PATH,
  MANAGE_TRASH_PATH,
  QUESTION_EDIT_PATH
} from '@/router'
import { getUserInfoFromStorage } from '@/utils'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import Logo from '@/layouts/components/Logo'
import UserMenu from '@/layouts/components/UserMenu'
const ManageLayout: React.FC = () => {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { isRequestSuccess, successMessage } = useRequestSuccessChecker()
  const createQuestion = async () => {
    const userInfo = getUserInfoFromStorage()
    const params = {
      author_id: userInfo.userId,
      author: userInfo.nickname
    }
    const res = await apis.questionApi.createQuestion(params)
    if (isRequestSuccess(res)) {
      successMessage('创建成功')
      nav(`${QUESTION_EDIT_PATH}/${res.data.id}`)
    }
  }
  // 手动触发逻辑
  const {
    loading,
    error,
    run: handleCreateQuestion
  } = useRequest(createQuestion, {
    manual: true
  })

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-[#E8F5F3] to-[#F1F8E9] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-[68px] flex justify-between items-center px-6 shrink-0 z-10 border-b border-gray-200/50 bg-white/30 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <FormOutlined className="text-[26px] text-[#408D86]" />
          <span className="text-[18px] font-bold text-gray-800 tracking-wide">小木问卷</span>
        </div>
        <UserMenu />
      </div>

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[200px] flex flex-col px-4 pt-6 pb-6 shrink-0 bg-white/20 backdrop-blur-sm border-r border-gray-200/50">
          <Space direction="vertical" className="w-full" size="middle">
            <Button
              loading={loading}
              className="w-full !rounded-lg !h-10 !bg-white hover:!bg-gray-50 !border-gray-200 !text-custom-primary-200 shadow-sm"
              icon={<FileAddFilled />}
              onClick={handleCreateQuestion}
            >
              新建问卷
            </Button>
            <Button
              className="w-full !rounded-full !h-10 !bg-gradient-to-r from-[#59A199] to-[#408D86] !text-white !border-none hover:opacity-90 flex items-center justify-center gap-1 shadow-md"
              onClick={() => {
                successMessage('AI 生成问卷功能开发中')
              }}
            >
              <SvgIcon name="ai" />
              <span className="ml-1">AI 生成问卷</span>
            </Button>
          </Space>

          <Divider className="my-6 border-gray-300/50" />

          <Space direction="vertical" className="w-full" size="small">
            {/* <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 ${pathname.startsWith(MANAGE_MARKET_PATH)
                  ? 'bg-[#D3EBE8] text-[#408D86] font-medium border-l-[3px] border-[#408D86] shadow-sm'
                  : 'text-gray-600 hover:bg-white/50 border-l-[3px] border-transparent'
                }`}
              onClick={() => nav(MANAGE_MARKET_PATH)}
            >
              <SvgIcon name="market" />
              <span className="flex-1">模板中心</span>
            </div> */}
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 ${pathname.startsWith(MANAGE_PERSONAL_PATH)
                  ? 'bg-[#D3EBE8] text-[#408D86] font-medium border-l-[3px] border-[#408D86] shadow-sm'
                  : 'text-gray-600 hover:bg-white/50 border-l-[3px] border-transparent'
                }`}
              onClick={() => nav(MANAGE_PERSONAL_PATH)}
            >
              <SvgIcon name="questionnaire" />
              <span className="flex-1">我的问卷</span>
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 ${pathname.startsWith(MANAGE_STAR_PATH)
                  ? 'bg-[#D3EBE8] text-[#408D86] font-medium border-l-[3px] border-[#408D86] shadow-sm'
                  : 'text-gray-600 hover:bg-white/50 border-l-[3px] border-transparent'
                }`}
              onClick={() => nav(MANAGE_STAR_PATH)}
            >
              <SvgIcon name="star" />
              <span className="flex-1">星标问卷</span>
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 ${pathname.startsWith(MANAGE_TRASH_PATH)
                  ? 'bg-[#D3EBE8] text-[#408D86] font-medium border-l-[3px] border-[#408D86] shadow-sm'
                  : 'text-gray-600 hover:bg-white/50 border-l-[3px] border-transparent'
                }`}
              onClick={() => nav(MANAGE_TRASH_PATH)}
            >
              <DeleteOutlined className="text-[16px]" />
              <span className="flex-1">回收站</span>
            </div>
          </Space>
        </div>

        {/* Main Content */}
        <div className="flex-1 w-0 h-full overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export default ManageLayout
