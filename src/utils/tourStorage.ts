import { getUserId } from './jwtUser'

function getTourKey(): string {
  const uid = getUserId()
  return uid ? `rw_tour_completed_${uid}` : 'rw_tour_completed'
}

export function isTourCompleted(): boolean {
  return localStorage.getItem(getTourKey()) === 'true'
}

export function markTourCompleted(): void {
  localStorage.setItem(getTourKey(), 'true')
}