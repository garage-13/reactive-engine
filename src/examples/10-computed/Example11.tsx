import baseClasses from '../ui.common.module.scss'
import clsx from 'clsx';
import { useSecondaryService } from '../201-multi-resource/store';
import { useReactiveValue } from '../../hooks';

export const Example11 = () => {
  const secondaryService = useSecondaryService()
  const { data } = useReactiveValue(secondaryService.apiState)

  return (
    <div className={clsx(baseClasses.unit, baseClasses.stack2)}>
      <div className={baseClasses.absoluteUnitLabel}>example 11 | Subscribed to example 21</div>
      <pre className={baseClasses.preNormalizedMin}>{JSON.stringify({ data }, null, 2)}</pre>
    </div>
  )
}
