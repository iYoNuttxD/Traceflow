import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getMemberInitials,
  MemberAvatarStack
} from '../../src/features/projects/components/MemberAvatarStack.jsx';

const memberNames = [
  'Daniel Ganz Musse',
  'Joana Vieira',
  'Gabriel Torres',
  'Ana Martins',
  'Bruno Ribeiro',
  'Carla Souza',
  'Elisa Freitas',
  'Fabio Lima'
];

function createMembers(count) {
  return memberNames.slice(0, count).map((name, index) => ({
    id: index + 1,
    isActive: true,
    user: { name, username: `membro-${index + 1}` }
  }));
}

describe('MemberAvatarStack', () => {
  it.each([
    [1, 1, null],
    [3, 3, null],
    [4, 3, '+1'],
    [8, 3, '+5']
  ])(
    'representa %i membros com até %i avatares individuais',
    (memberCount, visibleCount, remainder) => {
      const { container } = render(<MemberAvatarStack members={createMembers(memberCount)} />);

      expect(
        screen.getByRole('img', {
          name: `${memberCount} ${memberCount === 1 ? 'membro' : 'membros'} do projeto`
        })
      ).toBeInTheDocument();
      expect(container.querySelectorAll('.member-avatar-stack__member')).toHaveLength(visibleCount);

      if (remainder) expect(screen.getByText(remainder)).toBeInTheDocument();
      else
        expect(container.querySelector('.member-avatar-stack__remainder')).not.toBeInTheDocument();
    }
  );

  it('gera iniciais pelo nome e usa username como fallback', () => {
    expect(getMemberInitials({ user: { name: 'Daniel Ganz Musse', username: 'daniel' } })).toBe(
      'DG'
    );
    expect(getMemberInitials({ user: { name: 'Daniel', username: 'daniel' } })).toBe('D');
    expect(getMemberInitials({ user: { name: '', username: 'fallback-user' } })).toBe('F');
  });

  it('não renderiza membros fictícios no estado vazio', () => {
    const { container } = render(<MemberAvatarStack members={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
