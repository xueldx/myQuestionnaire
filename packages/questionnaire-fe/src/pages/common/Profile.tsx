import { useAvatar } from '@/hooks/useAvatar'
import { HOME_PATH, MANAGE_MARKET_PATH } from '@/router'
import { LeftOutlined } from '@ant-design/icons'
import { Avatar, FloatButton, Button, Modal, Form, Input, App } from 'antd'
import { Rule } from 'antd/es/form'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'
import apis from '@/apis'
import { QuestionListType } from '@/hooks/types'
import useRequestSuccessChecker from '@/hooks/useRequestSuccessChecker'
import CustomSpin from '@/components/CustomSpin/CustomSpin'

const Profile: React.FC = () => {
  const { message } = App.useApp()
  const { avatar } = useAvatar()
  const nav = useNavigate()
  const { isRequestSuccess } = useRequestSuccessChecker()
  const userInfo = useSelector((state: RootState) => state.profile.userInfo)

  const [userProfile, setUserProfile] = useState<{
    email: string
    nickname: string
    avatar: string
    bio: string
    createTime: string
  }>({
    email: '',
    nickname: '',
    avatar: '',
    bio: '',
    createTime: ''
  })

  const [questions, setQuestions] = useState<any[]>([])
  const [questionCount, setQuestionCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // 获取用户信息
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true)
        const res = await apis.authApi.getUserInfo()
        if (isRequestSuccess(res)) {
          setUserProfile(res.data.userInfo)
        }
      } catch (error) {
        console.error('获取用户信息失败:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserProfile()
  }, [])

  // 获取用户问卷列表
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // 获取用户的星标问卷列表
        const res = await apis.questionApi.getQuestionList(1, 3, '', QuestionListType.FAVORATE)
        if (res.code === 1 && res.data) {
          setQuestions(res.data.list || [])
          setQuestionCount(res.data.count || 0)
        }
      } catch (error) {
        console.error('获取星标问卷列表失败:', error)
      }
    }

    fetchQuestions()
  }, [])

  enum formItem {
    oldPassword = 'oldPassword',
    newPassword = 'newPassword',
    confirmPassword = 'confirmPassword'
  }

  const rules: Record<formItem, Rule[]> = {
    [formItem.oldPassword]: [
      { required: true, message: '请输入旧密码!' },
      {
        min: 8,
        max: 16,
        message: '密码长度不能小于8位,大于16位'
      }
    ],
    [formItem.newPassword]: [
      { required: true, message: '请输入新密码!' },
      {
        min: 8,
        max: 16,
        message: '密码长度不能小于8位,大于16位'
      }
    ],
    [formItem.confirmPassword]: [
      { required: true, message: '请输入确认新密码!' },
      ({ getFieldValue }) => ({
        validator(_, value) {
          if (!value || getFieldValue(formItem.newPassword) === value) {
            return Promise.resolve()
          } else {
            return Promise.reject(new Error('两次密码不一致'))
          }
        }
      })
    ]
  }

  const [form] = Form.useForm()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const changePassword = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const handleOk = () => {
    form.submit()
  }

  const handleCancel = () => {
    resetForm()
    setIsModalOpen(false)
  }

  const resetForm = () => {
    form.resetFields()
  }

  const onFinish = async (values: any) => {
    try {
      setChangingPassword(true)
      const res = await apis.authApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword
      })

      if (res.code === 1) {
        message.success('密码修改成功')
        setIsModalOpen(false)
        form.resetFields()
      } else {
        message.error(res.msg || '密码修改失败')
      }
    } catch (error) {
      console.error('修改密码失败:', error)
      message.error('修改密码失败，请稍后重试')
    } finally {
      setChangingPassword(false)
    }
  }

  const deleteAccount = () => {
    Modal.confirm({
      title: '确定要注销账号吗？',
      content: '注销后，您的所有数据将被删除，且无法恢复！',
      okText: '确认注销',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (!userInfo.userId) {
            message.error('未找到用户ID')
            return
          }

          const res = await apis.authApi.deleteAccount(userInfo.userId.toString())
          if (res.code === 1) {
            message.success('账号已注销')
            nav(HOME_PATH)
          } else {
            message.error(res.msg || '注销失败')
          }
        } catch (error) {
          console.error('注销账号失败:', error)
          message.error('注销账号失败，请稍后重试')
        }
      }
    })
  }

  // 计算使用天数
  const calculateUsageDays = (createTime: string) => {
    if (!createTime) return 0

    const createDate = new Date(createTime)
    const today = new Date()
    const diffTime = Math.abs(today.getTime() - createDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const usageDays = calculateUsageDays(userProfile.createTime)

  if (loading) {
    return (
      <div className="h-screen bg-custom-bg-200 flex items-center justify-center">
        <CustomSpin />
      </div>
    )
  }

  return (
    <div className="h-screen bg-custom-bg-200 p-4 pt-20 pb-16">
      <div className="bg-white h-full flex rounded-lg shadow-lg relative">
        <FloatButton
          type="primary"
          className="absolute left-5 top-5"
          icon={<LeftOutlined />}
          tooltip={<div>返回首页</div>}
          onClick={() => nav(HOME_PATH)}
        />

        {/* 左侧个人信息栏 */}
        <div className="w-1/3 p-8 border-r border-gray-200">
          <div className="flex flex-col items-center mb-8">
            <Avatar
              size={128}
              src={<img src={avatar} alt="avatar" className="rounded-full" />}
              className="ring-4 ring-gray-200 mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              {userProfile.nickname || '未设置昵称'}
            </h1>
            <span className="text-gray-600 text-sm">
              注册时间：
              {userProfile.createTime
                ? new Date(userProfile.createTime).toLocaleDateString()
                : '未知'}
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">个人简介</h2>
            <p className="text-gray-600 text-sm leading-6">
              {userProfile.bio || '这个用户很懒，还没有填写个人简介...'}
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">联系信息</h2>
            <div className="flex items-center text-sm text-gray-600 mb-2">
              <span className="mr-2">📧</span>
              <span>{userProfile.email || '未设置邮箱'}</span>
            </div>
            <div className="flex gap-4 text-sm">
              <Button variant="dashed" color="primary" size="small" onClick={changePassword}>
                修改密码
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">统计信息</h2>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-600">使用天数</span>
              <span className="font-medium">{usageDays} 天</span>
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-600">创建问卷</span>
              <span className="font-medium">{questionCount} 份</span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <Button variant="text" color="danger" onClick={deleteAccount}>
              账号注销
            </Button>
          </div>
        </div>

        <Modal
          title="修改密码"
          open={isModalOpen}
          onOk={handleOk}
          onCancel={handleCancel}
          confirmLoading={changingPassword}
        >
          <Form form={form} onFinish={onFinish} labelCol={{ span: 4 }}>
            <Form.Item required label="旧密码" name="oldPassword" rules={rules.oldPassword}>
              <Input.Password placeholder="请输入旧密码" />
            </Form.Item>
            <Form.Item required label="新密码" name="newPassword" rules={rules.newPassword}>
              <Input.Password placeholder="请输入新密码" />
            </Form.Item>
            <Form.Item
              required
              label="确认密码"
              name="confirmPassword"
              rules={rules.confirmPassword}
            >
              <Input.Password placeholder="请确认新密码" />
            </Form.Item>
          </Form>
        </Modal>

        {/* 右侧内容区域 */}
        <div className="flex-1 p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">我的星标问卷</h2>

          {/* 问卷列表 - 始终显示3个位置 */}
          <div className="grid gap-4">
            {questions.length > 0 ? (
              <>
                {/* 渲染已有的星标问卷 */}
                {questions.map(question => (
                  <div
                    key={question.id}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                    onClick={() => nav(`/question/detail/${question.id}`)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-gray-800 mb-1">{question.title}</h3>
                        <p className="text-sm text-gray-600">
                          创建于 {new Date(question.create_time).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm text-gray-500">
                        <span>📊 收集 {question.answer_count} 份</span>
                        <span
                          className={`${
                            question.is_published ? 'text-green-600' : 'text-yellow-600'
                          }`}
                        >
                          ● {question.is_published ? '进行中' : '未发布'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 如果已有的问卷少于3个，渲染空状态卡片填充剩余位置 */}
                {Array.from({ length: 3 - questions.length }).map((_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="p-4 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer bg-gray-50"
                    onClick={() => nav(MANAGE_MARKET_PATH)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-gray-800 mb-1 flex items-center">
                          <span className="text-yellow-500 mr-2">⭐</span>
                          <span>收藏更多问卷</span>
                        </h3>
                        <p className="text-sm text-gray-600">
                          点击前往问卷市场，挑选您感兴趣的问卷
                        </p>
                      </div>
                      <div className="text-sm text-blue-500">去收藏 →</div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              // 当没有任何星标问卷时，显示三个空状态卡片
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="p-4 border border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors cursor-pointer bg-gray-50"
                  onClick={() => nav(MANAGE_MARKET_PATH)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium text-gray-800 mb-1 flex items-center">
                        <span className="text-yellow-500 mr-2">⭐</span>
                        <span>收藏更多问卷</span>
                      </h3>
                      <p className="text-sm text-gray-600">点击前往问卷市场，挑选您感兴趣的问卷</p>
                    </div>
                    <div className="text-sm text-blue-500">去收藏 →</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile
