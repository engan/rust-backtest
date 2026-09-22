<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  text: string
}>()

const tooltipId = `field-tooltip-${useId().replaceAll(':', '')}`
</script>

<template>
  <span class="field-tooltip">
    <button
      class="field-tooltip-trigger"
      type="button"
      :aria-label="`Help: ${label}`"
      :aria-describedby="tooltipId"
    >
      i
    </button>
    <span :id="tooltipId" class="field-tooltip-content" role="tooltip">{{ text }}</span>
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
  position: absolute;
  right: -4px;
  bottom: calc(100% + 9px);
  z-index: 50;
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
  opacity: 0;
  pointer-events: none;
  transform: translateY(3px);
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  white-space: normal;
}

.field-tooltip-content::after {
  position: absolute;
  right: 7px;
  top: 100%;
  width: 8px;
  height: 8px;
  border-right: 1px solid #416175;
  border-bottom: 1px solid #416175;
  background: #07131c;
  content: '';
  transform: translateY(-4px) rotate(45deg);
}

.field-tooltip:hover .field-tooltip-content,
.field-tooltip:focus-within .field-tooltip-content {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
</style>
