<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import clsx from 'clsx'

// Импортируем ваши общие SCSS-модули
import baseClasses from '../ui.common.module.scss'
import btnClasses from '../ui.button.module.scss'

// Описываем интерфейс входных параметров (пропсов)
interface Props {
  title: string
  description?: string
  buttonText?: string
  className?: string
  footerText?: string
  useTwoColumns?: boolean
}

// Задаем значения по умолчанию для пропсов
const props = withDefaults(defineProps<Props>(), {
  buttonText: 'Show',
  useTwoColumns: false
})

// Локальное состояние открытия модального окна
const isOpen = ref(false)

// Блокируем прокрутку страницы body, когда модалка открыта
watch(isOpen, (newValue) => {
  if (newValue) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

// Сбрасываем стиль прокрутки при уничтожении (unmount) компонента карточки
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    :class="clsx(
      baseClasses.unit,
      baseClasses.stack2,
      props.className,
      { [baseClasses['unit--wide']]: props.useTwoColumns }
    )"
  >
    <!-- Метка-заголовок карточки в вашем фирменном стиле -->
    <div :class="baseClasses.absoluteUnitLabel">{{ props.title }}</div>

    <!-- Описание внутри карточки, если передано -->
    <p
      v-if="props.description"
      style="font-weight: bold; color: gray; margin: 0; font-family: system-ui;"
    >
      {{ props.description }}
    </p>

    <!-- Кнопка-триггер для открытия модалки -->
    <div style="margin-top: auto;">
      <button
        @click="isOpen = true"
        :class="clsx(
          btnClasses.btn,
          btnClasses.neonBtn,
          btnClasses['neonBtn--primary'],
          btnClasses['neonBtn--outlined']
        )"
      >
        {{ props.buttonText }}
      </button>
    </div>

    <!-- Модальное окно через Телепорт (Аналог createPortal на селектор body) -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background-color: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          padding-top: 24px;
          justify-content: center;
          z-index: 9999;
        "
        @click="isOpen = false"
      >
        <div
          style="
            border: 2px solid lightgray;
            border-radius: 32px;
            min-width: 320px;
            max-width: calc(100vw - 48px);
            max-height: calc(100vh - 48px);
            position: relative;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background-color: #fff;
          "
          @click.stop
        >
          <!-- ФИКСИРОВАННАЯ ШАПКА МОДЛКИ -->
          <div
            style="
              position: relative;
              padding: 16px 52px 16px 24px;
              border-bottom: 2px solid lightgray;
              flex-shrink: 0;
            "
          >
            <h3 style="margin-top: 0; margin-bottom: 0; padding-right: 24px;">
              {{ props.title }}
            </h3>

            <!-- Кнопка закрытия (крестик) -->
            <button
              @click="isOpen = false"
              style="
                position: absolute;
                top: 0px;
                right: 16px;
                transform: translateY(45%);
                background: none;
                border: 2px solid lightgray;
                width: 35px;
                height: 35px;
                border-radius: 50%;
                color: gray;
                cursor: pointer;
                font-size: '20px';
                line-height: 1;
                padding: 0;
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
              "
            >
              <span>✕</span>
            </button>
          </div>

          <!-- СКРОЛЛЯЩАЯСЯ ОБЛАСТЬ С КОНТЕНТОМ -->
          <div
            style="
              padding: 24px;
              overflow-y: auto;
              flex-grow: 1;
            "
          >
            <div :class="baseClasses.stack2">
              <!-- Слот Vue. Сюда подставится переданный компонент (например, <Example003 />) -->
              <slot />
            </div>
          </div>

          <!-- ФУТЕР (Показывается только если передан проп footerText) -->
          <div
            v-if="props.footerText"
            style="
              font-family: system-ui;
              font-size: small;
              padding: 16px 24px;
              border-top: 2px solid lightgray;
              flex-shrink: 0;
            "
          >
            {{ props.footerText }}
          </div>

        </div>
      </div>
    </Teleport>
  </div>
</template>
