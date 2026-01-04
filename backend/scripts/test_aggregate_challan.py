import asyncio
from server import db, create_aggregate_challan, Violation

async def main():
    # Insert sample violations: 3 * no_helmet + 1 triple_riding to simulate combined event
    v_ids = []
    for _ in range(3):
        v = Violation(user_id='test_user', violation_type='no_helmet').model_dump()
        v['created_at'] = v['created_at'].isoformat()
        await db.violations.insert_one(v)
        v_ids.append(v['id'])

    v_triple = Violation(user_id='test_user', violation_type='triple_riding').model_dump()
    v_triple['created_at'] = v_triple['created_at'].isoformat()
    await db.violations.insert_one(v_triple)
    v_ids.append(v_triple['id'])

    # Create aggregated challan
    challan = await create_aggregate_challan(v_ids, 'test_user')
    print('Created aggregated challan:', challan)
    if challan:
        print('Total fine', challan.get('fine_amount'))
        assert int(challan.get('fine_amount', 0)) == 2000, f"Expected total 2000, got {challan.get('fine_amount')}"
if __name__ == '__main__':
    asyncio.run(main())