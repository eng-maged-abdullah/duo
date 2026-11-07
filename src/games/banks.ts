/** كل بنوك الأسئلة مدموجة وبدون تكرار */
import { knowMeItems } from './content/knowMe'
import { moreDares, moreTruths } from './content/truthDareMore'
import { talkMore } from './content/talkMore'
import { thisOrThatMore } from './content/thisOrThatMore'
import { completeMore, guessAnswerMore, neverMore, whoMoreMore } from './content/more2'
import { completeMore2, guessAnswerMore2, neverMore2, whoMoreMore2 } from './content/more3'
import { askMeMore, completeMore3, guessAnswerMore3, neverMore3, whoMoreMore3 } from './content/more4'
import { compatMore, knowMeMore, rankMore } from './content/more5'
import { personalBank } from './content/personal'
import { personalBank2, rankMore2 } from './content/more6'
import { quickQuizMore } from './content/quizMore'
import { trueFalseMore } from './content/tfMore'
import { extraBank } from './content/more7'
import { askMe3, emoji3, quick3, rank3, remember3, riddles3, story3 } from './content/more8'
import { rank4, riddles4, story4 } from './content/more9'
import { dares, truths } from './content/truthDare'
import { compatItems, neverItems, thisOrThat, whoMore } from './content/choices'
import { askMeBank, completeItems, guessAnswerItems, rememberPrompts, talkItems } from './content/talk'
import { emojiPuzzles, quickQuiz, riddles, trueFalse } from './content/quiz'
import { memorySymbols, rankSets, storyStarters } from './content/misc'
import { neverBold, talkBold, whoMoreBold } from './content/v2/bold'

export const uniqBy = <T,>(arr: T[], key: (x: T) => string) => {
  const seen = new Set<string>()
  return arr.filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
type QO = { q: string; o: string[] }

export const allThisOrThat: [string, string][] = uniqBy([...thisOrThat, ...thisOrThatMore], (x) => x.join('|'))
const personal = [...personalBank, ...personalBank2, ...extraBank.personal] as QO[]
export const allKnowMe = uniqBy([...knowMeItems, ...(knowMeMore as QO[]), ...personal].filter((x) => x.o.length === 4), (x) => x.q)
export const allCompat = uniqBy([...compatItems, ...(compatMore as QO[]), ...personal].filter((x) => x.o.length >= 2), (x) => x.q)
export const allNever = uniqBy([...neverItems, ...neverMore, ...neverMore2, ...neverMore3, ...neverBold], (x) => x.t)
export const allWhoMore = [...new Set([...whoMore, ...whoMoreMore, ...whoMoreMore2, ...whoMoreMore3])]
export const allWhoMoreBold = [...new Set(whoMoreBold)].filter((q) => !allWhoMore.includes(q))
export const allComplete = [...new Set([...completeItems, ...completeMore, ...completeMore2, ...completeMore3])]
export const allGuess = [...new Set([...guessAnswerItems, ...guessAnswerMore, ...guessAnswerMore2, ...guessAnswerMore3])]
export const allRank = uniqBy(
  [...rankSets, ...(rankMore as QO[]), ...(rankMore2 as QO[]), ...extraBank.rank, ...(rank3 as QO[]), ...(rank4 as QO[])].filter((x) => x.o.length === 4),
  (x) => x.q,
)
export const allAskMe: Record<string, string[]> = Object.fromEntries(
  [...new Set([...Object.keys(askMeBank), ...Object.keys(askMeMore), ...Object.keys(extraBank.askMe)])].map((k) => [
    k,
    [...new Set([...(askMeBank[k] ?? []), ...(askMeMore[k] ?? []), ...(extraBank.askMe[k] ?? []), ...(k === 'تعارف' ? askMe3 : [])])],
  ]),
)
export const allTruths = moreTruths
export const allDares = moreDares
export { truths, dares }
export const allQuick = uniqBy([...quickQuiz, ...quickQuizMore, ...extraBank.quick, ...quick3], (x) => x.q)
export const allTF = uniqBy([...trueFalse, ...trueFalseMore, ...extraBank.tf], (x) => x.s)
export const allRiddles = uniqBy([...riddles, ...extraBank.riddles, ...riddles3, ...riddles4], (x) => x.q)
export const allEmoji = uniqBy([...emojiPuzzles, ...extraBank.emoji, ...emoji3], (x) => x.e)
export const allRemember = [...new Set([...rememberPrompts, ...extraBank.remember, ...remember3])]
export const allStory = [...new Set([...storyStarters, ...extraBank.story, ...story3, ...story4])]
export const memoryEmoji = memorySymbols

/** سوالف: كل الأسئلة المفتوحة بفئاتها */
const talkAll: { c: string; q: string }[] = [
  ...talkItems,
  ...Object.entries(talkMore).flatMap(([c, qs]) => qs.map((q) => ({ c, q }))),
  ...Object.entries(allAskMe).flatMap(([c, qs]) => qs.map((q) => ({ c, q }))),
  ...talkBold.map((q) => ({ c: 'جريئة 🔥', q })),
  ...allComplete.map((q) => ({ c: 'كمّلها ✍️', q })),
]
export const allTalk = uniqBy(talkAll, (x) => x.q)
export const talkCategories = [...new Set(allTalk.map((t) => t.c))]
