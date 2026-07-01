using Microsoft.AspNetCore.Mvc; 

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class HealthTrackerController : ControllerBase
    {
        public HealthTrackerController()
        {
            // Constructor for dependency injection
        }

        [HttpPost("exercise")]
        public IActionResult AddExercise([FromBody] Exercise exercise)
        {
            // Implementation for adding an exercise
            return Ok();
        }

        [HttpPost("food")]
        public IActionResult AddFoodItem([FromBody] FoodItem foodItem)
        {
            // Implementation for adding a food item
            return Ok();
        }
        public class Exercise
        {
        }

        public class FoodItem
        {
        }
    }
}