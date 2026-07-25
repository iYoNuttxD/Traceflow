export const forbiddenLegacyRead = () => prisma.githubArtifact.findMany();
