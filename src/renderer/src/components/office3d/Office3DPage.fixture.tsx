import { defineFixture } from '../../component-fixtures/component-fixture'
import { Office3DPage } from './Office3DPage'

export const office3dPlaceholder = defineFixture({
  width: 1024,
  render: () => (
    <div className="h-[760px] flex flex-col bg-background">
      <Office3DPage />
    </div>
  )
})
