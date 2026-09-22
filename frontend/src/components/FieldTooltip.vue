<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'

defineProps<{
  label: string
  text: string
}>()

const tooltipId = `field-tooltip-${useId().replaceAll(':', '')}`
const trigger = ref<HTMLButtonElement | null>(null)
const content = ref<HTMLElement | null>(null)
const visible = ref(false)
const placement = ref<'top' | 'bottom'>('top')
const tooltipStyle = ref<Record<string, string>>({})

const positionTooltip = () => {
  if (!trigger.value || !content.value) return
  const margin = 16
  const gap = 9
  const anchor = trigger.value.getBoundingClientRect()
  const popup = content.value.getBoundingClientRect()
  const left = Math.min(
    Math.max(margin, anchor.right - popup.width),
    window.innerWidth - popup.width - margin,
  )
  let top = anchor.top - popup.height - gap
  placement.value = 'top'
  if (top < margin) {
    top = anchor.bottom + gap
    placement.value = 'bottom'
  }
  top = Math.min(Math.max(margin, top), window.innerHeight - popup.height - margin)
  tooltipStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
  }
}

const showTooltip = async () => {
  visible.value = true
  await nextTick()
  positionTooltip()
  window.addEventListener('resize', positionTooltip)
  window.addEventListener('scroll', positionTooltip, true)
}

const hideTooltip = () => {
  visible.value = false
  window.removeEventListener('resize', positionTooltip)
  window.removeEventListener('scroll', positionTooltip, true)
}

onBeforeUnmount(hideTooltip)
</script>

<template>
  <span class="field-tooltip">
    <button
      ref="trigger"
      class="field-tooltip-trigger"
      type="button"
      :aria-label="`Help: ${label}`"
      :aria-describedby="tooltipId"
      @mouseenter="showTooltip"
      @mouseleave="hideTooltip"
      @focus="showTooltip"
      @blur="hideTooltip"
    >
      i
    </button>
    <Teleport to="body">
      <span
        v-show="visible"
        :id="tooltipId"
        ref="content"
        class="field-tooltip-content"
        :class="`field-tooltip-content--${placement}`"
        :style="tooltipStyle"
        role="tooltip"
      >{{ text }}</span>
    </Teleport>
  </span>
</template>

<style scoped>
.field-tooltip {
  position: relative;
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  justify-self: end;
}

.field-tooltip-trigger {
  display: inline-grid;
  width: 17px;
  min-width: 17px;
  height: 17px;
  min-height: 17px;
  padding: 0;
  place-items: center;
  border: 1px solid #7894a8;
  border-radius: 50%;
  background: transparent;
  color: #b9ccda;
  font-family: Georgia, serif;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
}

.field-tooltip-trigger:hover,
.field-tooltip-trigger:focus-visible {
  border-color: #55b4ff;
  outline: none;
  color: #55b4ff;
  box-shadow: 0 0 0 3px rgba(50, 151, 255, 0.14);
}

.field-tooltip-content {
  position: fixed;
  z-index: 2147483000;
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  padding: 0.58rem 0.68rem;
  border: 1px solid #416175;
  border-radius: 6px;
  background: #07131c;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
  color: #d9e7f1;
  font-family: Inter, "Segoe UI Variable", "Segoe UI", sans-serif;
  font-size: 0.75rem;
  font-weight: 450;
  line-height: 1.42;
  pointer-events: none;
  white-space: normal;
}

.field-tooltip-content::after {
  position: absolute;
  right: 5px;
  top: 100%;
  width: 8px;
  height: 8px;
  border-right: 1px solid #416175;
  border-bottom: 1px solid #416175;
  background: #07131c;
  content: '';
  transform: translateY(-4px) rotate(45deg);
}

.field-tooltip-content--bottom::after {
  top: -4px;
  border: 0;
  border-top: 1px solid #416175;
  border-left: 1px solid #416175;
  transform: rotate(45deg);
}
</style>
