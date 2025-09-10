import React from 'react'
import { useDispatch } from 'react-redux'
import {
  FormOutlined,
  FileTextOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  DownOutlined,
  StarOutlined,
  NumberOutlined,
  TableOutlined,
  AppstoreOutlined,
  SlidersOutlined,
  CalendarOutlined,
  UploadOutlined,
  PictureOutlined,
  OrderedListOutlined,
  FontSizeOutlined
} from '@ant-design/icons'
import { addComponent } from '@/store/modules/componentsSlice'
import { getComponentDefaultProps } from '@/utils/getComponentDefaultProps'
import { App } from 'antd'

const ComponentMarket: React.FC = () => {
  const { message } = App.useApp()
  const dispatch = useDispatch()

  // 处理组件点击，添加到编辑区域
  const handleComponentClick = (type: string) => {
    const componentInfo = getComponentDefaultProps(type)
    if (componentInfo) {
      dispatch(
        addComponent({
          type,
          title: componentInfo.title,
          props: componentInfo.props
        })
      )
      message.success('添加组件成功')
    }
  }

  const componentList = [
    {
      id: 1,
      name: '简答题',
      icon: <FormOutlined />,
      type: 'questionShortAnswer'
    },
    {
      id: 2,
      name: '段落题',
      icon: <FileTextOutlined />,
      type: 'questionParagraph'
    },
    {
      id: 3,
      name: '单选题',
      icon: <CheckOutlined />,
      type: 'questionRadio'
    },
    {
      id: 4,
      name: '多选题',
      icon: <CheckSquareOutlined />,
      type: 'questionCheckbox'
    },
    {
      id: 5,
      name: '下拉选择题',
      icon: <DownOutlined />,
      type: 'questionDropdown'
    },
    {
      id: 6,
      name: '评分题',
      icon: <StarOutlined />,
      type: 'questionRating'
    },
    {
      id: 7,
      name: 'NPS评分题',
      icon: <NumberOutlined />,
      type: 'questionNPS'
    },
    {
      id: 8,
      name: '矩阵单选题',
      icon: <TableOutlined />,
      type: 'questionMatrixRadio'
    },
    {
      id: 9,
      name: '矩阵多选题',
      icon: <AppstoreOutlined />,
      type: 'questionMatrixCheckbox'
    },
    {
      id: 10,
      name: '滑块题',
      icon: <SlidersOutlined />,
      type: 'questionSlider'
    },
    {
      id: 11,
      name: '日期选择题',
      icon: <CalendarOutlined />,
      type: 'questionDate'
    },
    {
      id: 12,
      name: '分段标题',
      icon: <FontSizeOutlined />,
      type: 'questionTitle'
    }
  ]

  return (
    <div className="grid grid-cols-2 gap-2 py-2">
      {componentList.map(component => (
        <div
          key={component.id}
          className="group border-custom-bg-200 border-dashed border rounded-lg p-2 transition-all duration-200 hover:border-custom-primary-100 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer flex flex-col items-center justify-center bg-white"
          onClick={() => handleComponentClick(component.type)}
        >
          <div className="flex flex-col items-center justify-center gap-1.5 py-0.5">
            <div className="w-8 h-8 text-[18px] flex items-center justify-center text-custom-primary-200 bg-custom-bg-100 rounded group-hover:bg-custom-primary-100 group-hover:text-white transition-colors duration-200">
              {component.icon}
            </div>
            <div className="text-xs font-medium text-custom-text-100 group-hover:text-custom-primary-200 transition-colors duration-200">
              {component.name}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default ComponentMarket
