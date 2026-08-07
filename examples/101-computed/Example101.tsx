import baseClasses from '~/ui.common.module.scss'
import clsx from 'clsx'
import { useReactiveValue } from '@pravosleva/reactive-engine/react'
import { useSecondaryService } from '~/201-multi-resource/store'

export const Example101 = () => {
  const secondaryService = useSecondaryService()
  const { data } = useReactiveValue(secondaryService.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>Subscribed to example 201</div>
      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
