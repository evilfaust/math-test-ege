const pbUrl = 'http://127.0.0.1:8090';

async function migrate() {
    console.log('Fetching exams...');
    const res = await fetch(`${pbUrl}/api/collections/exams/records?perPage=500`);
    const data = await res.json();
    const exams = data.items;

    console.log(`Found ${exams.length} exams.`);

    for (const exam of exams) {
        let newDate = '';

        // Same logic as excel-parser
        const labelDateMatch = exam.label.match(/(\d{2})\.(\d{2})\.(\d{2}|\d{4})/);
        if (labelDateMatch) {
            const yearStr = labelDateMatch[3];
            const year = yearStr.length === 2 ? `20${yearStr}` : yearStr;
            newDate = `${year}-${labelDateMatch[2]}-${labelDateMatch[1]}`;
        } else {
            const titleDateMatch = exam.title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
            if (titleDateMatch) {
                newDate = `${titleDateMatch[3]}-${titleDateMatch[2]}-${titleDateMatch[1]}`;
            }
        }

        if (newDate && newDate !== exam.date) {
            console.log(`Updating exam ${exam.id} (${exam.title}) date: ${exam.date} -> ${newDate}`);
            await fetch(`${pbUrl}/api/collections/exams/records/${exam.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ date: newDate }),
            });
        }
    }
    console.log('Done!');
}

migrate();
