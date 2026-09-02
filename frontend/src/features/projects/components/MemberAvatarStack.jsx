import './MemberAvatarStack.css';

const visibleMemberLimit = 3;

export function getMemberInitials(member) {
  const identity = member?.user?.name?.trim() || member?.user?.username?.trim() || '';

  return identity
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('pt-BR'))
    .join('');
}

export function MemberAvatarStack({ members }) {
  if (!members.length) return null;

  const visibleMembers = members.slice(0, visibleMemberLimit);
  const remainingCount = members.length - visibleMembers.length;
  const memberLabel = members.length === 1 ? 'membro' : 'membros';

  return (
    <div
      className="member-avatar-stack"
      role="img"
      aria-label={`${members.length} ${memberLabel} do projeto`}
    >
      {visibleMembers.map((member) => (
        <span
          className="member-avatar-stack__avatar member-avatar-stack__member"
          key={member.id}
          aria-hidden="true"
        >
          {getMemberInitials(member)}
        </span>
      ))}
      {remainingCount > 0 && (
        <span
          className="member-avatar-stack__avatar member-avatar-stack__remainder"
          aria-hidden="true"
        >
          +{remainingCount}
        </span>
      )}
    </div>
  );
}
