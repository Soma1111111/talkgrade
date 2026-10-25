(function(root){
  "use strict";
  const clone=value=>structuredClone(value);
  const newId=prefix=>root.TG_ids?.newId(prefix)||`${prefix}_${Math.random().toString(36).slice(2,14)}`;
  function exportCourse(state,courseId){
    const course=(state.courses||[]).find(item=>item.id===courseId);if(!course)throw Error("Course not found.");
    return {format:"talkgrade-course-backup",version:1,exportedAt:new Date().toISOString(),course:clone(course),assignments:clone((state.assignments||[]).filter(a=>a.courseId===courseId))};
  }
  function validateBackup(value){
    if(!value||value.format!=="talkgrade-course-backup"||value.version!==1||!value.course||typeof value.course.name!=="string"||!Array.isArray(value.assignments))throw Error("This is not a supported TalkGrade course backup.");
    const courseId=value.course.id;if(typeof courseId!=="string"||value.assignments.some(a=>!a||a.courseId!==courseId||!Array.isArray(a.students)||!a.rubric))throw Error("The course backup contains invalid assignment data.");
    if(value.assignments.length>500)throw Error("The backup contains too many assignments.");
    const count=value.assignments.reduce((n,a)=>n+a.students.length,0);if(count>5000)throw Error("The backup contains too many submissions.");
    return value;
  }
  function restoreCourse(state,input){
    const backup=validateBackup(input),oldCourseId=backup.course.id,course=clone(backup.course);course.id=newId("course");course.archived=false;course.name=String(course.name).slice(0,120);
    const submissionIds=new Map(),assignments=backup.assignments.map(source=>{
      const assignment=clone(source),oldAssignmentId=assignment.id;assignment.id=newId("assignment");assignment.courseId=course.id;assignment.course=course.name;
      assignment.students=(assignment.students||[]).map(student=>{const previous=student.id;student.id=newId("submission");submissionIds.set(previous,student.id);return student;});
      const mapId=id=>submissionIds.get(id)||id;
      assignment.dismissed=(assignment.dismissed||[]).map(id=>{let next=String(id);submissionIds.forEach((newValue,oldValue)=>{next=next.split(oldValue).join(newValue);});return next;});
      assignment.auditLog=(assignment.auditLog||[]).map(event=>({...event,assignmentId:assignment.id,submissionId:mapId(event.submissionId),studentIds:Array.isArray(event.studentIds)?event.studentIds.map(mapId):event.studentIds,changes:Array.isArray(event.changes)?event.changes.map(change=>({...change,studentId:mapId(change.studentId)})):event.changes}));
      assignment.similarityReviews=(assignment.similarityReviews||[]).map(review=>({...review,pairKey:String(review.pairKey||"").split("::").map(mapId).sort().join("::")}));
      return assignment;
    });
    const next={...state,courses:[...(state.courses||[]),course],assignments:[...(state.assignments||[]),...assignments],courseId:course.id,courseName:course.name};
    if(!assignments.length)return {...next,assignmentId:null,assignmentTitle:"",rubric:null,students:[],currentId:null,dismissed:[],auditLog:[],similarityReviews:[]};
    const first=assignments[0];return {...next,assignmentId:first.id,assignmentTitle:first.title,courseId:course.id,courseName:course.name,dueDate:first.dueDate||null,starterCode:first.starterCode||"",assignmentArchived:Boolean(first.archived),assignmentSettings:first.settings,rubricSourceId:first.rubricSourceId||null,rubric:clone(first.rubric),students:clone(first.students||[]),currentId:first.students?.[0]?.id||null,dismissed:clone(first.dismissed||[]),auditLog:clone(first.auditLog||[]),similarityReviews:clone(first.similarityReviews||[]),tone:first.tone||"warm"};
  }
  const api={exportCourse,validateBackup,restoreCourse};root.TG_courseBackup=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
