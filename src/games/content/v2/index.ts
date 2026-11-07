/** المحتوى الكامل للنسخة الثانية (الأساسي + الإضافي) بدون تكرار */
import { continueThemes, drawEasy, drawHard, drawMedium, type DrawWord } from './draw'
import {
  actRoles,
  complimentTopics,
  forbiddenRules,
  forbiddenTopics,
  humCategories,
  noLaughIdeas,
  raceCategories,
  stakeList,
  tabooCards,
  twentyCategories,
} from './voice'
import {
  actMore,
  complimentMore,
  continueMore,
  drawEasyMore,
  drawHardMore,
  drawMediumMore,
  forbiddenRulesMore,
  forbiddenTopicsMore,
  humMore,
  noLaughMore,
  raceMore,
  stakeMore,
  tabooMore,
  twentyMore,
} from './more'

const uniq = <T,>(arr: T[], key: (x: T) => string) => {
  const seen = new Set<string>()
  return arr.filter((x) => {
    const k = key(x).trim()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
const s = (x: string) => x

// الكلمة نفسها ما تتكرر بين مستويات الرسم
const easy = uniq<DrawWord>([...drawEasy, ...drawEasyMore], (x) => x.w)
const medium = uniq<DrawWord>([...drawMedium, ...drawMediumMore], (x) => x.w).filter((x) => !easy.some((e) => e.w === x.w))
const hard = uniq<DrawWord>([...drawHard, ...drawHardMore], (x) => x.w).filter((x) => !easy.some((e) => e.w === x.w) && !medium.some((m) => m.w === x.w))
export const drawWords = { easy, medium, hard }
export const allContinueThemes = uniq([...continueThemes, ...continueMore], s)
export const allTaboo = uniq([...tabooCards, ...tabooMore], (x) => x.w)
export const allAct = uniq([...actRoles, ...actMore], s)
export const allForbiddenRules = uniq([...forbiddenRules, ...forbiddenRulesMore], (x) => x.rule)
export const allForbiddenTopics = uniq([...forbiddenTopics, ...forbiddenTopicsMore], s)
export const allNoLaugh = uniq([...noLaughIdeas, ...noLaughMore], s)
export const allRace = uniq([...raceCategories, ...raceMore], s)
export const allHum = uniq([...humCategories, ...humMore], s)
export const allTwenty = uniq([...twentyCategories, ...twentyMore], (x) => x.c)
export const allStakes = uniq([...stakeList, ...stakeMore], s)
export const allCompliments = uniq([...complimentTopics, ...complimentMore], s)
