// Criado: 2026-11-02 BRT. A versao MIT do motor veio com checagem de permissao que sempre aprovava,
// inofensiva enquanto nao existia equipe no banco. Com calendario de equipe, a regra vale de verdade:
// membro aceito da equipe, com um dos papeis exigidos pela chamada.
import prisma from "@calcom/prisma";
import type { MembershipRole } from "@calcom/prisma/enums";

type PermissionCheck = { userId: number; teamId: number; permission?: string; fallbackRoles?: MembershipRole[] };

export class PermissionCheckService {
  constructor(_prisma?: unknown) {}

  async checkPermission({ userId, teamId, fallbackRoles = [] }: PermissionCheck): Promise<boolean> {
    if (!Number.isInteger(userId) || !Number.isInteger(teamId) || fallbackRoles.length === 0) return false;
    const member = await prisma.membership.findFirst({
      where: { userId, teamId, accepted: true, role: { in: fallbackRoles } },
      select: { id: true },
    });
    return member !== null;
  }

  async hasPermission(check: PermissionCheck): Promise<boolean> {
    return this.checkPermission(check);
  }

  async getTeamIdsWithPermission(..._args: unknown[]): Promise<number[]> {
    return [];
  }
}
