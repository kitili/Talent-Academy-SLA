import { readFileSync } from 'node:fs'
import type { ModuleAccessReaders, PathCourse } from '../../../server/learnerPath.ts'
import { cohortCourseOrder, type ScopeReaders } from '../../../server/scope.ts'

/**
 * Rows in memory for the learner-path rules (no database). Course order goes through the real C5
 * resolver `cohortCourseOrder`, fed with step and placement rows.
 */
export type PathFacts = {
    courses: PathCourse[]
    /** Courses placed on the cohort, with `assignedAt` (the order before D1). */
    placements: Array<{ courseId: string; assignedAt: string }>
    /** Steps of the cohort; each lists its courses in order. */
    steps?: Array<{ id: string; orderIndex: number; courses: string[] }>
    modules: Record<string, Array<{ id: string; weekNumber: number; deckFiles: Array<{ id: string }> }>>
    progress?: Record<string, Array<{ deckFileId: string; status?: string; viewedAt?: Date | null; completedAt?: Date | null }>>
    approved?: string[]
    passed?: string[]
    checked?: string[]
    /** Open cohorts the Fellow is in that hold each course. */
    enrolledIn?: Record<string, Array<{ id: string; status?: string }>>
}

export function readersFor(facts: PathFacts): ModuleAccessReaders {
    const scope: ScopeReaders = {
        trainerCohorts: async () => [],
        cohortIdsHoldingCourse: async () => [],
        teacherCohorts: async () => [],
        cohortSteps: async () =>
            (facts.steps ?? []).map((step) => ({
                id: step.id,
                orderIndex: step.orderIndex,
                courses: step.courses.map((courseId, orderIndex) => ({ courseId, orderIndex })),
            })),
        cohortPlacements: async () => facts.placements,
    }
    return {
        courseOrder: (cohortId) => cohortCourseOrder(cohortId, scope),
        coursesForCohort: async () => facts.courses,
        checkedCourseIds: async () => facts.checked ?? [],
        modulesForCourse: async (courseId) => facts.modules[courseId] ?? [],
        progressForModule: async (_teacherId, moduleId) => facts.progress?.[moduleId] ?? [],
        quizApproved: async (moduleId, fileId) => (facts.approved ?? []).includes(`${moduleId}/${fileId}`),
        quizPassed: async (moduleId, fileId) => (facts.passed ?? []).includes(`${moduleId}/${fileId}`),
        course: async (courseId) => facts.courses.find((course) => course.id === courseId),
        teacherCohortsForCourse: async (_teacherId, courseId) => facts.enrolledIn?.[courseId] ?? [],
    }
}

export const cohort = { id: 'cohort-1', status: 'open' }

/** A source file, for text contracts over route wiring that cannot be driven without a database. */
export function source(path: string) {
    return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

/** The text of one route handler, from its registration to the next `app.` registration. */
export function handler(text: string, start: string) {
    const from = text.indexOf(start)
    if (from < 0) throw new Error(`handler not found: ${start}`)
    const next = text.indexOf('\n  app.', from + start.length)
    return text.slice(from, next < 0 ? undefined : next)
}

/** The text of one storage method, from its declaration to the next `async ` method. */
export function method(text: string, start: string) {
    const from = text.indexOf(start)
    if (from < 0) throw new Error(`method not found: ${start}`)
    const next = text.indexOf('\n  async ', from + start.length)
    return text.slice(from, next < 0 ? undefined : next)
}
