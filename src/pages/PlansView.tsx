import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '@shared/types/project'
import type { Plan, PlanStep, StepStatus } from '@shared/types/plan'
import {
	IconAgent,
	IconArtifact,
	IconChevronDown,
	IconChevronUp,
	IconEdit,
	IconFile,
	IconPlan,
	IconPlus,
	IconProblem,
	IconRefresh,
	IconSend,
	IconTerminal,
	IconTrash,
} from '../components/Icons'
import { planApi } from '../services/planApi'
import { useMediaQuery } from '../hooks/useMediaQuery'
import '../styles/plans.css'

type PlansViewProps = {
	project: Project
	onSendToChat?: (promptText: string) => void
	onNavigateToChat?: () => void
	onOpenInEditor?: (filePath: string, line?: number) => void
	onOpenInTerminal?: (sessionId?: string) => void
	onOpenArtifact?: (artifactId: string) => void
	onOpenProblem?: (problemId: string) => void
}

const STARTER_PLANS: Array<{ title: string; description: string; steps: Array<{ title: string; detail?: string }> }> = [
	{
		title: 'Feature Implementation',
		description: 'Implement new frontend components and backend endpoints',
		steps: [
			{ title: 'Inspect existing architecture and contracts', detail: 'Review shared types and endpoints' },
			{ title: 'Implement backend services and routes', detail: 'Add service logic and unit tests' },
			{ title: 'Build frontend UI components and styles', detail: 'Create touch-friendly responsive views' },
			{ title: 'Verify builds, lints and tests', detail: 'Run npm run build and test suite' },
		],
	},
	{
		title: 'Bug Fix & Regression Test',
		description: 'Diagnose and resolve active problem',
		steps: [
			{ title: 'Reproduce issue and isolate failing test case' },
			{ title: 'Fix bug in source file' },
			{ title: 'Verify diagnostics pass cleanly' },
			{ title: 'Commit and push changes' },
		],
	},
]

export function PlansView({
	project,
	onSendToChat,
	onNavigateToChat,
	onOpenInEditor,
	onOpenInTerminal,
	onOpenArtifact,
	onOpenProblem,
}: PlansViewProps) {
	const isWide = useMediaQuery('(min-width: 769px)')
	const [plans, setPlans] = useState<Plan[]>([])
	const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [artifactNotice, setArtifactNotice] = useState<string | null>(null)

	// Create Plan Modal
	const [createModalOpen, setCreateModalOpen] = useState(false)
	const [newTitle, setNewTitle] = useState('')
	const [newDesc, setNewDesc] = useState('')
	const [creating, setCreating] = useState(false)

	// Step Modal (Add or Edit)
	const [stepModalOpen, setStepModalOpen] = useState(false)
	const [editingStep, setEditingStep] = useState<PlanStep | null>(null)
	const [stepTitle, setStepTitle] = useState('')
	const [stepDetail, setStepDetail] = useState('')
	const [stepFile, setStepFile] = useState('')
	const [stepLine, setStepLine] = useState<string>('')
	const [stepCommand, setStepCommand] = useState('')
	const [stepStatus, setStepStatus] = useState<StepStatus>('pending')
	const [stepProblemId, setStepProblemId] = useState('')
	const [savingStep, setSavingStep] = useState(false)

	const loadPlans = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			const list = await planApi.list(project.id)
			setPlans(list)
			if (list.length > 0) {
				if (!selectedPlanId || !list.some((p) => p.id === selectedPlanId)) {
					setSelectedPlanId(list[0].id)
				}
			} else {
				setSelectedPlanId(null)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load plans')
		} finally {
			setLoading(false)
		}
	}, [project.id, selectedPlanId])

	useEffect(() => {
		void loadPlans()
	}, [loadPlans])

	const activePlan = useMemo(() => {
		if (!selectedPlanId) return null
		return plans.find((p) => p.id === selectedPlanId) || null
	}, [plans, selectedPlanId])

	const completedCount = useMemo(() => {
		if (!activePlan) return 0
		return activePlan.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
	}, [activePlan])

	const progressPercent = useMemo(() => {
		if (!activePlan || activePlan.steps.length === 0) return 0
		return Math.round((completedCount / activePlan.steps.length) * 100)
	}, [activePlan, completedCount])

	const handleCreatePlan = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!newTitle.trim() || creating) return
		setCreating(true)
		setError(null)
		try {
			const created = await planApi.create(project.id, {
				title: newTitle.trim(),
				description: newDesc.trim() || undefined,
			})
			setPlans((prev) => [created, ...prev])
			setSelectedPlanId(created.id)
			setCreateModalOpen(false)
			setNewTitle('')
			setNewDesc('')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create plan')
		} finally {
			setCreating(false)
		}
	}

	const handleCreateFromTemplate = async (template: (typeof STARTER_PLANS)[0]) => {
		setCreating(true)
		setError(null)
		try {
			const created = await planApi.create(project.id, {
				title: template.title,
				description: template.description,
				steps: template.steps.map((s) => ({ title: s.title, detail: s.detail, status: 'pending' })),
			})
			setPlans((prev) => [created, ...prev])
			setSelectedPlanId(created.id)
			setCreateModalOpen(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create plan')
		} finally {
			setCreating(false)
		}
	}

	const handleDeletePlan = async (planId: string) => {
		if (!confirm('Are you sure you want to delete this plan?')) return
		try {
			await planApi.delete(project.id, planId)
			setPlans((prev) => prev.filter((p) => p.id !== planId))
			if (selectedPlanId === planId) {
				const rem = plans.filter((p) => p.id !== planId)
				setSelectedPlanId(rem.length > 0 ? rem[0].id : null)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete plan')
		}
	}

	const handleToggleStepStatus = async (step: PlanStep) => {
		if (!activePlan) return
		const nextStatus: StepStatus =
			step.status === 'pending'
				? 'in_progress'
				: step.status === 'in_progress'
				? 'completed'
				: step.status === 'completed'
				? 'skipped'
				: 'pending'

		try {
			const updated = await planApi.updateStep(project.id, activePlan.id, step.id, {
				status: nextStatus,
			})
			if (updated) {
				setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update step')
		}
	}

	const handleMoveStep = async (index: number, direction: 'up' | 'down') => {
		if (!activePlan) return
		const newIndex = direction === 'up' ? index - 1 : index + 1
		if (newIndex < 0 || newIndex >= activePlan.steps.length) return

		const newSteps = [...activePlan.steps]
		const [moved] = newSteps.splice(index, 1)
		newSteps.splice(newIndex, 0, moved)

		try {
			const updated = await planApi.reorderSteps(
				project.id,
				activePlan.id,
				newSteps.map((s) => s.id),
			)
			if (updated) {
				setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to reorder steps')
		}
	}

	const handleDeleteStep = async (stepId: string) => {
		if (!activePlan) return
		const remaining = activePlan.steps.filter((s) => s.id !== stepId)
		try {
			const updated = await planApi.update(project.id, activePlan.id, { steps: remaining })
			if (updated) {
				setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete step')
		}
	}

	const handleOpenAddStep = () => {
		setEditingStep(null)
		setStepTitle('')
		setStepDetail('')
		setStepFile('')
		setStepLine('')
		setStepCommand('')
		setStepStatus('pending')
		setStepProblemId('')
		setStepModalOpen(true)
	}

	const handleOpenEditStep = (step: PlanStep) => {
		setEditingStep(step)
		setStepTitle(step.title)
		setStepDetail(step.detail || '')
		setStepFile(step.file || '')
		setStepLine(step.line ? step.line.toString() : '')
		setStepCommand(step.command || '')
		setStepStatus(step.status)
		setStepProblemId(step.problemId || '')
		setStepModalOpen(true)
	}

	const handleSaveStep = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!activePlan || !stepTitle.trim() || savingStep) return
		setSavingStep(true)
		setError(null)

		const parsedLine = stepLine.trim() ? parseInt(stepLine.trim(), 10) : undefined

		try {
			if (editingStep) {
				const updated = await planApi.updateStep(project.id, activePlan.id, editingStep.id, {
					title: stepTitle.trim(),
					detail: stepDetail.trim() || undefined,
					file: stepFile.trim() || undefined,
					line: !isNaN(parsedLine!) ? parsedLine : undefined,
					command: stepCommand.trim() || undefined,
					status: stepStatus,
					problemId: stepProblemId.trim() || undefined,
				})
				if (updated) {
					setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
				}
			} else {
				const updated = await planApi.addStep(project.id, activePlan.id, {
					title: stepTitle.trim(),
					detail: stepDetail.trim() || undefined,
					file: stepFile.trim() || undefined,
					line: !isNaN(parsedLine!) ? parsedLine : undefined,
					command: stepCommand.trim() || undefined,
					status: stepStatus,
					problemId: stepProblemId.trim() || undefined,
				})
				if (updated) {
					setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
				}
			}
			setStepModalOpen(false)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save step')
		} finally {
			setSavingStep(false)
		}
	}

	const handleExecuteWithAgent = () => {
		if (!activePlan) return
		const nextStep = activePlan.steps.find((s) => s.status === 'pending' || s.status === 'in_progress')

		const promptLines = [
			`[EXECUTE PLAN: ${activePlan.title}]`,
			activePlan.description ? `Goal: ${activePlan.description}` : null,
			'',
			'Plan Steps:',
			...activePlan.steps.map((s, idx) => {
				const icon = s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'
				return `${idx + 1}. [${icon}] ${s.title}${s.detail ? ` (${s.detail})` : ''}`
			}),
			'',
			nextStep
				? `Please execute Step: "${nextStep.title}"${nextStep.file ? ` (File: ${nextStep.file})` : ''}${nextStep.command ? ` (Command: ${nextStep.command})` : ''}.`
				: `All steps are marked complete. Please review the implementation and verify all requirements.`,
		]
			.filter(Boolean)
			.join('\n')

		if (onSendToChat) onSendToChat(promptLines)
		if (onNavigateToChat) onNavigateToChat()
	}

	const handleAskAboutStep = (step: PlanStep) => {
		if (!activePlan) return
		const prompt = [
			`[PLAN STEP QUESTION: ${activePlan.title}]`,
			`Step: ${step.title}`,
			step.detail ? `Details: ${step.detail}` : null,
			step.file ? `File: ${step.file}${step.line ? `:${step.line}` : ''}` : null,
			'',
			`How should we approach implementing this step?`,
		]
			.filter(Boolean)
			.join('\n')

		if (onSendToChat) onSendToChat(prompt)
		if (onNavigateToChat) onNavigateToChat()
	}

	const handleCreateArtifact = async () => {
		if (!activePlan) return
		setError(null)
		try {
			const art = await planApi.createArtifactFromPlan(project.id, activePlan.id)
			setArtifactNotice(`Artifact "${art.title}" created successfully!`)
			setTimeout(() => setArtifactNotice(null), 4000)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create artifact from plan')
		}
	}

	return (
		<div className="plans-view">
			{/* Left Sidebar: Plans List (on wider screens or when selecting plans) */}
			{isWide && (
				<aside className="plans-sidebar">
					<div className="plans-sidebar__header">
						<div className="plans-sidebar__title">
							<IconPlan className="processes-btn-icon" />
							<span>Plans ({plans.length})</span>
						</div>
						<button
							type="button"
							className="processes-btn processes-btn--primary processes-btn--sm"
							onClick={() => setCreateModalOpen(true)}
							title="Create new plan"
						>
							<IconPlus className="processes-btn-icon" />
							<span>New Plan</span>
						</button>
					</div>

					<div className="plans-sidebar__list">
						{plans.map((p) => {
							const isSelected = p.id === selectedPlanId
							const done = p.steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length

							return (
								<div
									key={p.id}
									className={`plan-item${isSelected ? ' is-active' : ''}`}
									onClick={() => setSelectedPlanId(p.id)}
								>
									<div className="plan-item__header">
										<span className="plan-item__title">{p.title}</span>
										<span className={`plan-status-badge plan-status-badge--${p.status}`}>
											{p.status}
										</span>
									</div>

									<div className="plan-item__meta">
										<span>
											{done}/{p.steps.length} steps
										</span>
										<span>{new Date(p.updatedAt).toLocaleDateString()}</span>
									</div>
								</div>
							)
						})}
					</div>
				</aside>
			)}

			{/* Main Pane: Active Plan Detail & Steps */}
			<main className="plans-main">
				{artifactNotice && (
					<div
						className="process-backend-warning"
						style={{
							background: 'rgba(16, 185, 129, 0.15)',
							borderColor: 'rgba(16, 185, 129, 0.3)',
							color: '#10b981',
						}}
					>
						<span>{artifactNotice}</span>
						{onOpenArtifact && (
							<button
								type="button"
								className="processes-btn processes-btn--sm"
								onClick={() => onOpenArtifact('')}
								style={{ marginLeft: 'auto' }}
							>
								View Artifacts
							</button>
						)}
					</div>
				)}

				{error && (
					<div className="process-backend-warning" role="alert">
						<span>{error}</span>
					</div>
				)}

				{loading && plans.length === 0 ? (
					<div className="plans-empty">
						<IconRefresh className="processes-btn-icon processes-spin" />
						<span>Loading plans...</span>
					</div>
				) : !activePlan ? (
					<div className="plans-empty">
						<IconPlan style={{ width: '36px', height: '36px', color: 'var(--accent)' }} />
						<span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
							No active plan selected
						</span>
						<span>Create a structured agent execution plan to track development steps.</span>
						<button
							type="button"
							className="processes-btn processes-btn--primary"
							onClick={() => setCreateModalOpen(true)}
							style={{ marginTop: '12px' }}
						>
							<IconPlus className="processes-btn-icon" />
							<span>Create First Plan</span>
						</button>
					</div>
				) : (
					<>
						{/* Plan Header */}
						<div className="plans-header">
							<div className="plans-header__top">
								<div className="plans-header__title-row">
									{!isWide && plans.length > 1 && (
										<select
											className="problems-select"
											value={selectedPlanId || ''}
											onChange={(e) => setSelectedPlanId(e.target.value)}
										>
											{plans.map((p) => (
												<option key={p.id} value={p.id}>
													{p.title}
												</option>
											))}
										</select>
									)}

									<span className="plans-header__title">{activePlan.title}</span>
									<span className={`plan-status-badge plan-status-badge--${activePlan.status}`}>
										{activePlan.status}
									</span>
								</div>

								<div className="plans-header__actions">
									<button
										type="button"
										className="processes-btn processes-btn--primary"
										onClick={handleExecuteWithAgent}
										title="Send next step to Agent for execution"
									>
										<IconAgent className="processes-btn-icon" />
										<span>Execute with Agent</span>
									</button>

									<button
										type="button"
										className="processes-btn"
										onClick={handleCreateArtifact}
										title="Create a Markdown artifact from this plan"
									>
										<IconArtifact className="processes-btn-icon" />
										<span>To Artifact</span>
									</button>

									<button
										type="button"
										className="processes-btn"
										onClick={handleOpenAddStep}
										title="Add a new step"
									>
										<IconPlus className="processes-btn-icon" />
										<span>Add Step</span>
									</button>

									<button
										type="button"
										className="processes-btn processes-btn--danger processes-btn--sm"
										onClick={() => handleDeletePlan(activePlan.id)}
										title="Delete plan"
									>
										<IconTrash className="processes-btn-icon" />
									</button>
								</div>
							</div>

							{activePlan.description && (
								<div className="plans-header__desc">{activePlan.description}</div>
							)}

							{/* Progress Bar */}
							<div className="plan-progress-bar-wrap">
								<div className="plan-progress-text">
									<span>
										Progress: {completedCount} of {activePlan.steps.length} steps completed
									</span>
									<span>{progressPercent}%</span>
								</div>
								<div className="plan-progress-track">
									<div
										className="plan-progress-fill"
										style={{ width: `${progressPercent}%` }}
									/>
								</div>
							</div>
						</div>

						{/* Steps List */}
						<div className="plans-body">
							{activePlan.steps.length === 0 ? (
								<div className="plans-empty">
									<IconPlan className="processes-btn-icon" />
									<span>This plan has no steps yet.</span>
									<button
										type="button"
										className="processes-btn processes-btn--primary"
										onClick={handleOpenAddStep}
									>
										<IconPlus className="processes-btn-icon" />
										<span>Add First Step</span>
									</button>
								</div>
							) : (
								activePlan.steps.map((step, idx) => {
									const isCompleted = step.status === 'completed'
									const isInProgress = step.status === 'in_progress'
									const isFailed = step.status === 'failed'

									return (
										<div
											key={step.id}
											className={`step-card step-card--${step.status}`}
										>
											<div className="step-card__top">
												<div className="step-card__left">
													<button
														type="button"
														className="step-status-btn"
														onClick={() => void handleToggleStepStatus(step)}
														title={`Status: ${step.status} (Click to toggle)`}
													>
														{isCompleted ? (
															<span className="step-status-icon--completed">✓</span>
														) : isInProgress ? (
															<span className="step-status-icon--in_progress">●</span>
														) : isFailed ? (
															<span className="step-status-icon--failed">✕</span>
														) : step.status === 'skipped' ? (
															<span className="step-status-icon--skipped">⊘</span>
														) : (
															<span className="step-status-icon--pending">○</span>
														)}
													</button>

													<div className="step-card__title-wrap">
														<span
															className={`step-card__title${isCompleted ? ' step-card__title--completed' : ''}`}
														>
															{idx + 1}. {step.title}
														</span>
														{step.detail && (
															<span className="step-card__detail">{step.detail}</span>
														)}

														{/* Badges / Links */}
														<div className="step-card__badges">
															{step.file && (
																<span
																	className="step-badge"
																	onClick={() => onOpenInEditor?.(step.file!, step.line)}
																	title="Open referenced file in Code Editor"
																>
																	<IconFile className="processes-btn-icon" />
																	<span>
																		{step.file}
																		{step.line ? `:${step.line}` : ''}
																	</span>
																</span>
															)}

															{step.command && (
																<span
																	className="step-badge"
																	onClick={() => onOpenInTerminal?.()}
																	title="Open Terminal"
																>
																	<IconTerminal className="processes-btn-icon" />
																	<span>{step.command}</span>
																</span>
															)}

															{step.problemId && (
																<span
																	className="step-badge"
																	onClick={() => onOpenProblem?.(step.problemId!)}
																	title="View linked problem"
																	style={{ color: '#ef4444' }}
																>
																	<IconProblem className="processes-btn-icon" />
																	<span>Problem</span>
																</span>
															)}

															{step.artifactId && (
																<span
																	className="step-badge"
																	onClick={() => onOpenArtifact?.(step.artifactId!)}
																	title="Open Artifact"
																>
																	<IconArtifact className="processes-btn-icon" />
																	<span>Artifact</span>
																</span>
															)}
														</div>
													</div>
												</div>

												{/* Step Controls */}
												<div className="step-card__actions">
													<button
														type="button"
														className="processes-btn processes-btn--sm"
														onClick={() => handleAskAboutStep(step)}
														title="Ask Agent about this step"
													>
														<IconSend className="processes-btn-icon" />
														<span>Ask</span>
													</button>

													<button
														type="button"
														className="processes-btn processes-btn--sm"
														onClick={() => handleOpenEditStep(step)}
														title="Edit step details"
													>
														<IconEdit className="processes-btn-icon" />
													</button>

													{idx > 0 && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => void handleMoveStep(idx, 'up')}
															title="Move step up"
														>
															<IconChevronUp className="processes-btn-icon" />
														</button>
													)}

													{idx < activePlan.steps.length - 1 && (
														<button
															type="button"
															className="processes-btn processes-btn--sm"
															onClick={() => void handleMoveStep(idx, 'down')}
															title="Move step down"
														>
															<IconChevronDown className="processes-btn-icon" />
														</button>
													)}

													<button
														type="button"
														className="processes-btn processes-btn--sm"
														onClick={() => void handleDeleteStep(step.id)}
														title="Delete step"
													>
														<IconTrash className="processes-btn-icon" />
													</button>
												</div>
											</div>
										</div>
									)
								})
							)}
						</div>
					</>
				)}
			</main>

			{/* Create Plan Modal */}
			{createModalOpen && (
				<div
					className="processes-modal-backdrop"
					onClick={() => !creating && setCreateModalOpen(false)}
				>
					<div className="processes-modal" onClick={(e) => e.stopPropagation()}>
						<div className="processes-modal__title">Create New Plan</div>
						<form onSubmit={handleCreatePlan} className="processes-modal__body">
							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Plan Title
								</label>
								<input
									type="text"
									className="processes-modal__input"
									placeholder="e.g. Implement Authentication Flow"
									value={newTitle}
									onChange={(e) => setNewTitle(e.target.value)}
									disabled={creating}
									required
									autoFocus
								/>
							</div>

							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Goal / Overview (optional)
								</label>
								<textarea
									className="processes-modal__input"
									rows={3}
									placeholder="Describe the high-level objective..."
									value={newDesc}
									onChange={(e) => setNewDesc(e.target.value)}
									disabled={creating}
								/>
							</div>

							<div>
								<span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
									Or start from template:
								</span>
								<div className="processes-quick-templates">
									{STARTER_PLANS.map((tpl) => (
										<button
											key={tpl.title}
											type="button"
											className="processes-template-chip"
											onClick={() => void handleCreateFromTemplate(tpl)}
										>
											{tpl.title}
										</button>
									))}
								</div>
							</div>

							<div className="processes-modal__footer">
								<button
									type="button"
									className="processes-btn"
									onClick={() => setCreateModalOpen(false)}
									disabled={creating}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="processes-btn processes-btn--primary"
									disabled={creating || !newTitle.trim()}
								>
									<IconPlus className="processes-btn-icon" />
									<span>{creating ? 'Creating...' : 'Create Plan'}</span>
								</button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Add / Edit Step Modal */}
			{stepModalOpen && (
				<div
					className="processes-modal-backdrop"
					onClick={() => !savingStep && setStepModalOpen(false)}
				>
					<div className="processes-modal" onClick={(e) => e.stopPropagation()}>
						<div className="processes-modal__title">
							{editingStep ? 'Edit Plan Step' : 'Add New Step'}
						</div>
						<form onSubmit={handleSaveStep} className="processes-modal__body">
							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Step Title
								</label>
								<input
									type="text"
									className="processes-modal__input"
									placeholder="e.g. Add session provider component"
									value={stepTitle}
									onChange={(e) => setStepTitle(e.target.value)}
									disabled={savingStep}
									required
									autoFocus
								/>
							</div>

							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Details / Instructions (optional)
								</label>
								<textarea
									className="processes-modal__input"
									rows={2}
									placeholder="Specific files, functions or requirements..."
									value={stepDetail}
									onChange={(e) => setStepDetail(e.target.value)}
									disabled={savingStep}
								/>
							</div>

							<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
								<div>
									<label
										style={{
											fontSize: '11px',
											color: 'var(--text-secondary)',
											marginBottom: '4px',
											display: 'block',
										}}
									>
										Related File (optional)
									</label>
									<input
										type="text"
										className="processes-modal__input"
										placeholder="e.g. src/App.tsx"
										value={stepFile}
										onChange={(e) => setStepFile(e.target.value)}
										disabled={savingStep}
									/>
								</div>
								<div>
									<label
										style={{
											fontSize: '11px',
											color: 'var(--text-secondary)',
											marginBottom: '4px',
											display: 'block',
										}}
									>
										Line
									</label>
									<input
										type="number"
										className="processes-modal__input"
										placeholder="42"
										value={stepLine}
										onChange={(e) => setStepLine(e.target.value)}
										disabled={savingStep}
									/>
								</div>
							</div>

							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
								<div>
									<label
										style={{
											fontSize: '11px',
											color: 'var(--text-secondary)',
											marginBottom: '4px',
											display: 'block',
										}}
									>
										Command (optional)
									</label>
									<input
										type="text"
										className="processes-modal__input"
										placeholder="e.g. npm test"
										value={stepCommand}
										onChange={(e) => setStepCommand(e.target.value)}
										disabled={savingStep}
									/>
								</div>
								<div>
									<label
										style={{
											fontSize: '11px',
											color: 'var(--text-secondary)',
											marginBottom: '4px',
											display: 'block',
										}}
									>
										Status
									</label>
									<select
										className="processes-modal__input"
										value={stepStatus}
										onChange={(e) => setStepStatus(e.target.value as StepStatus)}
										disabled={savingStep}
									>
										<option value="pending">Pending</option>
										<option value="in_progress">In Progress</option>
										<option value="completed">Completed</option>
										<option value="failed">Failed</option>
										<option value="skipped">Skipped</option>
									</select>
								</div>
							</div>

							<div>
								<label
									style={{
										fontSize: '11px',
										color: 'var(--text-secondary)',
										marginBottom: '4px',
										display: 'block',
									}}
								>
									Linked Problem ID (optional)
								</label>
								<input
									type="text"
									className="processes-modal__input"
									placeholder="e.g. ts_src/App.tsx_12_5_TS2322"
									value={stepProblemId}
									onChange={(e) => setStepProblemId(e.target.value)}
									disabled={savingStep}
								/>
							</div>

							<div className="processes-modal__footer">
								<button
									type="button"
									className="processes-btn"
									onClick={() => setStepModalOpen(false)}
									disabled={savingStep}
								>
									Cancel
								</button>
								<button
									type="submit"
									className="processes-btn processes-btn--primary"
									disabled={savingStep || !stepTitle.trim()}
								>
									<span>{savingStep ? 'Saving...' : editingStep ? 'Update Step' : 'Add Step'}</span>
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	)
}

