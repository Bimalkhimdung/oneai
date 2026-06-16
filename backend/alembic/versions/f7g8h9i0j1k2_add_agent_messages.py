"""Add agent messages

Revision ID: f7g8h9i0j1k2
Revises: 18909c8ccd49
Create Date: 2026-06-16 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7g8h9i0j1k2'
down_revision: Union[str, Sequence[str], None] = '18909c8ccd49'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'agent_messages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('session_id', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['agent_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('agent_messages_session_id_created_at_idx', 'agent_messages', ['session_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_agent_messages_session_id'), 'agent_messages', ['session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_messages_session_id'), table_name='agent_messages')
    op.drop_index('agent_messages_session_id_created_at_idx', table_name='agent_messages')
    op.drop_table('agent_messages')
