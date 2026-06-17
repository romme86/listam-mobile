import { useCallback, useMemo } from 'react'
import { locate, step } from '@listam/domain/list-nav'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { listsActions, selectSelectedListId } from '../store/listsSlice'
import { selectNavLibrary } from '../store/registrySelectors'
import { useSnackbar } from '../components/Snackbar'
import { useI18n } from '../i18n'
import { haptics } from '../feedback'

// Glue between the swipe pager and the store: resolves the next/previous list
// (or a group jump), switches to it, and raises a toast when a group boundary
// is crossed. The actual list content re-renders via selectSelectedListItems.
export function useListPager() {
    const dispatch = useAppDispatch()
    const lib = useAppSelector(selectNavLibrary)
    const currentId = useAppSelector(selectSelectedListId)
    const snackbar = useSnackbar()
    const i18n = useI18n()

    const position = useMemo(() => locate(lib, currentId), [lib, currentId])

    const commit = useCallback((dir: 1 | -1, jumpGroup = false): boolean => {
        const move = step(lib, currentId, dir, { jumpGroup })
        if (!move.listId) {
            haptics.select()
            return false
        }
        const dest = lib.listsById[move.listId]
        dispatch(listsActions.selectedListChanged({ listId: move.listId, listType: dest?.type }))
        if (move.crossedGroup) {
            haptics.success()
            snackbar.show(i18n.t('nav.toast.enteredGroup', { group: move.toGroupName ?? '' }), 'info')
        } else {
            haptics.select()
        }
        return true
    }, [lib, currentId, dispatch, snackbar, i18n])

    return { lib, currentId, position, commit }
}
