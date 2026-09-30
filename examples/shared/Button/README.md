```tsx
import { Button } from '~/shared'

// 1. Обычная (primary) кнопка отправки с реактивным лоадером
<Button
  type="submit"
  variant="contained"
  colorType="primary"
  fullWidth
  isLoading={isLoading}       // Сигнал logic.isLoading.value из реактивного движка
  disabled={!isFormCorrect}   // Сигнал logic.isFormCorrect.value
>
  Отправить данные
</Button>

// 2. Красная (danger) кнопка очистки или отмены
<Button
  type="button"
  variant="outlined"
  colorType="danger"
  fullWidth
  onClick={() => fileService.clearFiles()}
>
  Удалить файлы
</Button>
```
