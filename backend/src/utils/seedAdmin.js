import bcrypt from "bcryptjs";
import userRepository from "../modules/users/user.repository.js";
import { ROLES, UserEntity } from "../zodSchema/index.js";

const DEFAULT_PASSWORD =
  process.env.DEV_SEED_PASSWORD ||
  process.env.SUPER_ADMIN_PASSWORD ||
  process.env.DEFAULT_DEV_PASSWORD ||
  "Admin@123";

const USERS = [
  {
    email: process.env.SUPER_ADMIN_EMAIL || "admin@vms.com",
    firstName: "System",
    lastName: "Admin",
    role: ROLES.SUPER_ADMIN,
  },
  {
    email: "casemanager@vms.com",
    firstName: "Case",
    lastName: "Manager",
    role: ROLES.CASE_MANAGER,
  },
  {
    email: "teamlead@vms.com",
    firstName: "Team",
    lastName: "Lead",
    role: ROLES.TEAM_LEAD,
  },
  {
    email: "manager@vms.com",
    firstName: "Account",
    lastName: "Manager",
    role: ROLES.MANAGER,
  },
  {
    email: "finance@vms.com",
    firstName: "Finance",
    lastName: "Head",
    role: ROLES.FINANCE_HEAD,
  },
];

const seedAdmin = async () => {
  try {
    for (const user of USERS) {
      const exists = await userRepository.findByEmail(user.email);

      if (exists) {
        console.log(`✔ ${user.role} already exists.`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

      const now = new Date();

      await userRepository.createUser({
        [UserEntity.columns.EMAIL]: user.email,
        [UserEntity.columns.PASSWORD]: hashedPassword,
        [UserEntity.columns.ROLE]: user.role,
        [UserEntity.columns.FIRST_NAME]: user.firstName,
        [UserEntity.columns.LAST_NAME]: user.lastName,
        [UserEntity.columns.STATUS]: "ACTIVE",
        [UserEntity.columns.ACTIVATED_AT]: now,
        [UserEntity.columns.PASSWORD_SET_AT]: now,
        [UserEntity.columns.ORG_ID]: "e0a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c",
      });

      console.log(`✔ ${user.role} created.`);
    }

    console.log("Development users seeded successfully.");
  } catch (error) {
    console.error("Seeding failed:", error);
  }
};

export default seedAdmin;