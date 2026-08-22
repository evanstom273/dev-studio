export type { AgentMode, AgentSession, BackendHealth, ConversationItem, MessageRole, PermissionRequest, RunCommandRequest, RunCommandResult, StreamEvent, ToolStatus } from '@shared/types/agent'
export type { ConnectionConfig, ConnectionState, ApiError } from '@shared/types/connection'
export type { AppRoute, CloneRepoRequest, InitRepoRequest, Project, RegisterProjectRequest, RepoTab, WorkspaceView } from '@shared/types/project'
export type { BranchRequest, ChangedFile, ChangeStatus, CommitRequest, DiffHunk, DiffLine, DiscardRequest, FileDiff, FileTreeNode, GitBranch, GitCommit, GitStatus, MergeConflict, MergeRequest, PullRequest, PushRequest, RemoteRequest, RevertRequest, StageRequest } from '@shared/types/git'
export type { CreateGitHubRepoRequest, CreatePullRequestRequest, ClosePullRequestRequest, DeleteRepoRequest, GitHubAuthStatus, GitHubPullRequest, GitHubPullRequestDetail, GitHubPullRequestState, GitHubRepo, GitHubRepoDetails, GitHubRepoInfo, LinkRemoteRequest, MergePullRequestRequest, UpdatePullRequestRequest, UpdateRepoRequest } from '@shared/types/github'
export type { Artifact, ArtifactType, CreateArtifactRequest, ImportArtifactFromRepoRequest, SaveArtifactToRepoRequest, UpdateArtifactRequest } from '@shared/types/artifact'
export type { CreateTerminalSessionRequest, TerminalClientMessage, TerminalServerMessage, TerminalSessionInfo } from '@shared/types/terminal'
export type { ToolId } from '@shared/types/project'

export type NavItem = {
	id: WorkspaceView
	label: string
	shortLabel: string
}

import type { WorkspaceView } from '@shared/types/project'

export const NAV_ITEMS: NavItem[] = [
	{ id: 'agent', label: 'Agent', shortLabel: 'Agent' },
	{ id: 'changes', label: 'Changes', shortLabel: 'Diff' },
	{ id: 'files', label: 'Files', shortLabel: 'Files' },
	{ id: 'repo', label: 'Repository', shortLabel: 'Repo' },
	{ id: 'status', label: 'Status & Quota', shortLabel: 'Status' },
]

export const AGENT_MODES = [
	{ id: 'agent' as const, label: 'Agent', description: 'Full autonomous coding' },
	{ id: 'ask' as const, label: 'Ask', description: 'Questions only, no edits' },
	{ id: 'plan' as const, label: 'Plan', description: 'Plan without executing' },
]

export const RUN_COMMANDS = [
	{ id: 'build', label: 'npm run build', command: 'npm run build' },
	{ id: 'test', label: 'npm test', command: 'npm test' },
	{ id: 'lint', label: 'npm run lint', command: 'npm run lint' },
]
