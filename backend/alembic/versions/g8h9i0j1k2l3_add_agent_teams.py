"""Add agent teams and profiles

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-06-16 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'g8h9i0j1k2l3'
down_revision: Union[str, Sequence[str], None] = 'f7g8h9i0j1k2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agent_teams',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_teams_user_id'), 'agent_teams', ['user_id'], unique=False)

    op.create_table(
        'agent_profiles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('team_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('system_prompt', sa.String(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['team_id'], ['agent_teams.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_profiles_team_id'), 'agent_profiles', ['team_id'], unique=False)

    op.add_column('agent_sessions', sa.Column('team_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'agent_sessions_team_id_fkey',
        'agent_sessions',
        'agent_teams',
        ['team_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('agent_sessions_team_id_fkey', 'agent_sessions', type_='foreignkey')
    op.drop_column('agent_sessions', 'team_id')
    op.drop_index(op.f('ix_agent_profiles_team_id'), table_name='agent_profiles')
    op.drop_table('agent_profiles')
    op.drop_index(op.f('ix_agent_teams_user_id'), table_name='agent_teams')
    op.drop_table('agent_teams')
