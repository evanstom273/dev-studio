import { projectsApi } from '../services/gitApi'

export async function findFolderPathByName(
	roots: string[],
	folderName: string,
	maxDepth = 4,
): Promise<string | null> {
	const target = folderName.trim().toLowerCase()
	if (!target) return null

	for (const root of roots) {
		const found = await searchFolderByName(root, target, 0, maxDepth)
		if (found) return found
	}

	return null
}

async function searchFolderByName(
	root: string,
	targetName: string,
	depth: number,
	maxDepth: number,
): Promise<string | null> {
	let listing
	try {
		listing = await projectsApi.browse(root)
	} catch {
		return null
	}

	const direct = listing.entries.find((entry) => entry.name.toLowerCase() === targetName)
	if (direct) return direct.path

	if (depth >= maxDepth) return null

	for (const entry of listing.entries) {
		const nested = await searchFolderByName(entry.path, targetName, depth + 1, maxDepth)
		if (nested) return nested
	}

	return null
}
