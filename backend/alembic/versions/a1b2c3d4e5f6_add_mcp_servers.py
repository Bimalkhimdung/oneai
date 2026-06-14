"""Add MCP servers

Revision ID: a1b2c3d4e5f6
Revises: 47de4800334b
Create Date: 2026-06-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '47de4800334b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mcp_servers',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('transport', sa.Enum('STDIO', 'SSE', name='mcptransport', native_enum=False), nullable=False),
        sa.Column('command', sa.String(), nullable=True),
        sa.Column('args', sa.JSON(), nullable=True),
        sa.Column('env', sa.JSON(), nullable=True),
        sa.Column('url', sa.String(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'name', name='mcp_servers_user_id_name_key'),
    )
    op.create_index(op.f('ix_mcp_servers_user_id'), 'mcp_servers', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_mcp_servers_user_id'), table_name='mcp_servers')
    op.drop_table('mcp_servers')
