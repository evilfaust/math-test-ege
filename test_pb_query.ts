import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

async function test() {
    await pb.admins.authWithPassword('admin@example.com', 'password123456');

    const groups = await pb.collection('groups').getFullList();
    console.log("Groups:", groups.map(g => g.name));

    if (groups.length === 0) return;
    const groupId = groups[0].id;

    const stds = await pb.collection('students').getFullList({ filter: `group="${groupId}"` });
    const exs = await pb.collection('exams').getFullList({ filter: `group="${groupId}"` });

    console.log(`Students in first group: ${stds.length}`);
    console.log(`Exams in first group: ${exs.length}`);

    if (stds.length > 0 && exs.length > 0) {
        const studentIds = stds.map((s) => `"${s.id}"`).join(',');
        const examIds = exs.map((e) => `"${e.id}"`).join(',');
        console.log(`Querying student_results with: student?~[${studentIds}] && exam?~[${examIds}]`);

        try {
            const allResults = await pb.collection('student_results').getFullList({
                filter: `student?~[${studentIds}] && exam?~[${examIds}]`,
            });
            console.log(`Results found: ${allResults.length}`);

            const allResultsNoFilter = await pb.collection('student_results').getFullList();
            console.log(`Total results in DB: ${allResultsNoFilter.length}`);
        } catch (e) {
            console.log("Error querying:", e.message);
        }
    }
}

test();
