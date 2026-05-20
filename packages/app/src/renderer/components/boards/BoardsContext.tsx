import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Board,
  BoardsAction,
  Epic,
  Project,
  ProjectBundle,
  ProjectSummary,
  ProjectViewTab,
  Sprint,
  Task,
  TaskTypeConfig,
} from "../../../shared/boards-types";

type BoardsContextValue = {
  // Data
  projects: ProjectSummary[];
  activeProject: Project | null;
  boards: Board[];
  tasks: Task[];
  sprints: Sprint[];
  epics: Epic[];
  taskTypeRegistry: TaskTypeConfig[];

  // UI selection state
  activeProjectId: string | null;
  activeBoardId: string | null;
  activeTab: ProjectViewTab;
  selectedTaskId: string | null;
  isTaskDetailOpen: boolean;
  /** When true, the kanban shows every task regardless of sprint membership. */
  showAllTasksInBoard: boolean;
  /** The single active sprint for the active project, or null. */
  activeSprint: Sprint | null;

  // Actions
  setActiveProjectId: (id: string | null) => void;
  setActiveBoardId: (id: string | null) => void;
  setActiveTab: (tab: ProjectViewTab) => void;
  setShowAllTasksInBoard: (show: boolean) => void;
  openTaskDetail: (taskId: string) => void;
  closeTaskDetail: () => void;
  dispatch: (action: BoardsAction) => Promise<void>;

  loading: boolean;
};

const BoardsContext = createContext<BoardsContextValue | null>(null);

const boardsApi = () => window.electronAPI.boards;

export function BoardsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [taskTypeRegistry, setTaskTypeRegistry] = useState<TaskTypeConfig[]>(
    [],
  );

  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(
    null,
  );
  const [activeBoardId, setActiveBoardIdState] = useState<string | null>(null);
  const [activeTab, setActiveTabState] = useState<ProjectViewTab>("board");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [showAllTasksInBoard, setShowAllTasksInBoard] = useState(false);

  const [loading, setLoading] = useState(true);

  // Keep latest activeProjectId for closure-free event handlers.
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;

  const refreshProjects = useCallback(async () => {
    const list = await boardsApi().listProjects();
    setProjects(list);
    return list;
  }, []);

  const refreshBundle = useCallback(async (projectId: string | null) => {
    if (!projectId) {
      setBundle(null);
      return;
    }
    const b = await boardsApi().getProjectBundle(projectId);
    setBundle(b);
  }, []);

  // Initial load — projects + task type registry.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, registry] = await Promise.all([
        boardsApi().listProjects(),
        boardsApi().taskTypeRegistry(),
      ]);
      if (cancelled) return;
      setProjects(list);
      setTaskTypeRegistry(registry);
      if (list.length && activeProjectIdRef.current === null) {
        setActiveProjectIdState(list[0].id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate bundle when project changes.
  useEffect(() => {
    void refreshBundle(activeProjectId);
  }, [activeProjectId, refreshBundle]);

  // Auto-select first board when bundle loads or active board disappears.
  useEffect(() => {
    if (!bundle) {
      setActiveBoardIdState(null);
      return;
    }
    const exists = bundle.boards.some((b) => b.id === activeBoardId);
    if (!exists) {
      setActiveBoardIdState(bundle.boards[0]?.id ?? null);
    }
  }, [bundle, activeBoardId]);

  // Subscribe to push events.
  useEffect(() => {
    const api = boardsApi();
    const offProject = api.onProjectChanged(async (payload) => {
      const list = await refreshProjects();
      if ("deleted" in payload) {
        if (payload.deleted === activeProjectIdRef.current) {
          setActiveProjectIdState(list[0]?.id ?? null);
        }
        return;
      }
      if (payload.project.id === activeProjectIdRef.current) {
        void refreshBundle(payload.project.id);
      }
    });
    const offBoard = api.onBoardChanged(() => {
      void refreshBundle(activeProjectIdRef.current);
    });
    const offTasks = api.onTasksChanged(() => {
      void refreshBundle(activeProjectIdRef.current);
    });
    const offSprints = api.onSprintsChanged(() => {
      void refreshBundle(activeProjectIdRef.current);
    });
    const offEpics = api.onEpicsChanged(() => {
      void refreshBundle(activeProjectIdRef.current);
    });
    return () => {
      offProject();
      offBoard();
      offTasks();
      offSprints();
      offEpics();
    };
  }, [refreshProjects, refreshBundle]);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    setActiveBoardIdState(null);
    setActiveTabState("board");
    setSelectedTaskId(null);
    setIsTaskDetailOpen(false);
    setShowAllTasksInBoard(false);
  }, []);

  const setActiveBoardId = useCallback((id: string | null) => {
    setActiveBoardIdState(id);
    setSelectedTaskId(null);
    setIsTaskDetailOpen(false);
  }, []);

  const setActiveTab = useCallback((tab: ProjectViewTab) => {
    setActiveTabState(tab);
    setSelectedTaskId(null);
    setIsTaskDetailOpen(false);
  }, []);

  const openTaskDetail = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setIsTaskDetailOpen(true);
  }, []);

  const closeTaskDetail = useCallback(() => {
    setIsTaskDetailOpen(false);
  }, []);

  const dispatch = useCallback(async (action: BoardsAction) => {
    await boardsApi().dispatch(action);
  }, []);

  const sprints = bundle?.sprints ?? [];
  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === "active") ?? null,
    [sprints],
  );

  const value = useMemo<BoardsContextValue>(
    () => ({
      projects,
      activeProject: bundle?.project ?? null,
      boards: bundle?.boards ?? [],
      tasks: bundle?.tasks ?? [],
      sprints,
      epics: bundle?.epics ?? [],
      taskTypeRegistry,
      activeProjectId,
      activeBoardId,
      activeTab,
      selectedTaskId,
      isTaskDetailOpen,
      showAllTasksInBoard,
      activeSprint,
      setActiveProjectId,
      setActiveBoardId,
      setActiveTab,
      setShowAllTasksInBoard,
      openTaskDetail,
      closeTaskDetail,
      dispatch,
      loading,
    }),
    [
      projects,
      bundle,
      sprints,
      activeSprint,
      taskTypeRegistry,
      activeProjectId,
      activeBoardId,
      activeTab,
      selectedTaskId,
      isTaskDetailOpen,
      showAllTasksInBoard,
      setActiveProjectId,
      setActiveBoardId,
      setActiveTab,
      openTaskDetail,
      closeTaskDetail,
      dispatch,
      loading,
    ],
  );

  return (
    <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>
  );
}

export function useBoardsContext(): BoardsContextValue {
  const ctx = useContext(BoardsContext);
  if (!ctx) {
    throw new Error("useBoardsContext must be used inside <BoardsProvider />");
  }
  return ctx;
}
