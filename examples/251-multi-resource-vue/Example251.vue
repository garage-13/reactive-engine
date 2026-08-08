<script setup lang="ts">
import { computed } from 'vue'
import clsx from 'clsx'
import { useUserInfoService, useSecondaryService, vueEngine } from './store'

// Импортируем стили песочницы
import baseClasses from '~/ui.common.module.scss'
import btnClasses from '~/ui.button.module.scss'

const BASE_API_URL = import.meta.env.VITE_BASE_API_URL

// 1. Извлекаем сервисы из нашего DI-стора
const userInfo = useUserInfoService()
const secondaryService = useSecondaryService()

// 2. Подписываем примитивы ядра на контекст Vue-реактивности
const activePersonId = vueEngine.use(userInfo.activePersonId)
const personList = vueEngine.use(userInfo.personList)

// 3. Подписываем сложные объекты ресурсов ядра
const userApiState = vueEngine.use(userInfo.apiState)
const secondaryApiState = vueEngine.use(secondaryService.apiState)

// 4. Оборачиваем вложенные поля ресурсов в computed для изоляции обновлений в шаблоне
const userLoading = computed(() => userApiState.value?.loading)
const userData = computed(() => userApiState.value?.data)
const userError = computed(() => userApiState.value?.error)

const secondaryLoading = computed(() => secondaryApiState.value?.loading)
const secondaryData = computed(() => secondaryApiState.value?.data)
const secondaryError = computed(() => secondaryApiState.value?.error)
</script>

<template>
  <div :class="clsx(baseClasses.unit, baseClasses['unit--wide'], baseClasses.stack2)">
    <div :class="baseClasses.absoluteUnitLabel" title="Chain of Resources (Vue)">
      Chain of Resources (Vue)
    </div>
    <code>{{ BASE_API_URL }}</code>

    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
      <!-- Кнопка обновления родительского ресурса -->
      <button
        @click="userInfo.inc()"
        :class="clsx(btnClasses.btn, btnClasses.neonBtn, btnClasses['neonBtn--primary'], btnClasses['neonBtn--outlined'])"
      >
        Refresh account data
      </button>

      <!-- Рендерим список кнопок пользователей -->
      <button
        v-for="p in personList"
        :key="p.id"
        @click="userInfo.setActivePersonId(p.id)"
        :class="clsx(
          btnClasses.btn,
          btnClasses.neonBtn,
          btnClasses['neonBtn--secondary'],
          {
            [btnClasses['neonBtn--contained']]: activePersonId && p.id === activePersonId,
            [btnClasses['neonBtn--outlined']]: p.id !== activePersonId,
          }
        )"
      >
        {{ p.name }}
      </button>
    </div>

    <!-- Вывод состояний обоих ресурсов бок о бок -->
    <div :class="baseClasses.unitInternalWrapper">
      <!-- Блок Первого Ресурса (User Info) -->
      <div :class="baseClasses.stack2">
        <div>
          {{ userLoading ? '🟡 loading...' : userData ? '🟢 ok' : userError ? `🔴 err | ${userError?.message || 'No error msg'}` : '⚪' }}
        </div>
        <pre :class="baseClasses.preNormalizedMin">{{ JSON.stringify({ data: userData }, null, 2) }}</pre>
      </div>

      <!-- Блок Второго Ресурса (Secondary Service, зависящего от первого) -->
      <div :class="baseClasses.stack2">
        <div>
          {{ secondaryLoading ? '🟡 loading...' : secondaryData ? '🟢 ok' : secondaryError ? `🔴 err | ${secondaryError?.message || 'No error msg'}` : '⚪' }}
        </div>
        <pre :class="baseClasses.preNormalizedMin">{{ JSON.stringify({ data: secondaryData }, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
