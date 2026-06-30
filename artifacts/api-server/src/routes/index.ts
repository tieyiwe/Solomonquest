import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import schoolsRouter from "./schools";
import usersRouter from "./users";
import programsRouter from "./programs";
import coursesRouter from "./courses";
import assignmentsRouter from "./assignments";
import submissionsRouter from "./submissions";
import announcementsRouter from "./announcements";
import notificationsRouter from "./notifications";
import applicationsRouter from "./applications";
import attendanceRouter from "./attendance";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(schoolsRouter);
router.use(usersRouter);
router.use(programsRouter);
router.use(coursesRouter);
router.use(assignmentsRouter);
router.use(submissionsRouter);
router.use(announcementsRouter);
router.use(notificationsRouter);
router.use(applicationsRouter);
router.use(attendanceRouter);
router.use(dashboardRouter);

export default router;
