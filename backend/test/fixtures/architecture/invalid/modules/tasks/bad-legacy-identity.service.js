export function invalidLegacyIdentity(req, prisma, task) {
  if (task.responsible === req.auth.user.name) return true;
  prisma.task.update({ where: { id: task.id }, data: { responsible: req.body.responsible } });
  return prisma.taskMovement.create({
    data: { movedBy: req.body.movedBy, projectMemberId: req.body.projectMemberId }
  });
}
