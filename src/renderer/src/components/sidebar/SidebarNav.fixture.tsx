import { defineFixture } from '../../component-fixtures/component-fixture'
import SidebarNav from './SidebarNav'
import { getDefaultSettings } from '../../../../shared/constants'

export const withOffice3D = defineFixture({
  width: 260,
  store: {
    settings: {
      ...getDefaultSettings('/tmp'),
      enableOffice3D: true
    },
    activeView: 'office3d'
  },
  render: () => (
    <div className="w-[260px] p-2 bg-background text-foreground">
      <SidebarNav />
    </div>
  )
})

export const office3dFlagOff = defineFixture({
  width: 260,
  store: {
    settings: {
      ...getDefaultSettings('/tmp'),
      enableOffice3D: false
    },
    activeView: 'terminal'
  },
  render: () => (
    <div className="w-[260px] p-2 bg-background text-foreground">
      <SidebarNav />
    </div>
  )
})
