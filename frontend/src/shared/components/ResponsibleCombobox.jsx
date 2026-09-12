import { useMemo } from 'react';
import { SearchCombobox } from './SearchCombobox.jsx';

const memberId = (member) => member.user?.id || member.userId || member.id;
const memberLabel = (member) => member.name;

export function ResponsibleCombobox({
  members = [],
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  id,
  currentName,
  includeInactive = false,
  help
}) {
  const options = useMemo(
    () =>
      members
        .filter(
          (member) =>
            includeInactive || (member.isActive !== false && member.user?.isActive !== false)
        )
        .map((member) => ({
          id: memberId(member),
          name: member.user?.name || member.name || `Responsável #${memberId(member)}`
        })),
    [members, includeInactive]
  );
  const selected =
    options.find((member) => String(member.id) === String(value)) ||
    (value ? { id: value, name: currentName || `Responsável #${value}` } : null);
  return (
    <SearchCombobox
      id={id}
      label="Responsável"
      placeholder="Pesquisar responsável..."
      options={options}
      selectedOption={selected}
      getOptionLabel={memberLabel}
      minQueryLength={0}
      openOnFocus={false}
      required={required}
      disabled={disabled}
      error={error}
      help={help}
      onSelect={(member) => onChange(String(member.id))}
      onClear={() => onChange('')}
      emptyMessage="Nenhum responsável disponível."
    />
  );
}
